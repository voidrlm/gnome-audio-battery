import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import UPower from 'gi://UPowerGlib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call');

// Same pill height as Now Playing, so the two sit together.
const PILL_HEIGHT = 22;
// Only this many rings fit in the panel; the menu lists everything.
const MAX_IN_PANEL = 4;
// Ring colour: green, then yellow at or below WARN, red at or below LOW.
const WARN = 40;
const LOW = 20;
const COLORS = {ok: [0.34, 0.89, 0.54], warn: [0.96, 0.83, 0.18], low: [1, 0.42, 0.37]};

const ICONS = {
    'headset': 'audio-headset-symbolic',
    'headphones': 'audio-headphones-symbolic',
    'speakers': 'audio-speakers-symbolic',
    'mouse': 'input-mouse-symbolic',
    'keyboard': 'input-keyboard-symbolic',
    'touchpad': 'input-touchpad-symbolic',
    'gaming-input': 'input-gaming-symbolic',
    'pen': 'input-tablet-symbolic',
    'tablet': 'input-tablet-symbolic',
    'phone': 'phone-symbolic',
    'media-player': 'multimedia-player-symbolic',
    'computer': 'computer-symbolic',
    'pda': 'phone-symbolic',
    'modem': 'network-cellular-symbolic',
    'network': 'network-wireless-symbolic',
    'video': 'camera-video-symbolic',
    'other-audio': 'audio-speakers-symbolic',
    'remote-control': 'media-playback-start-symbolic',
    'printer': 'printer-symbolic',
    'scanner': 'scanner-symbolic',
    'camera': 'camera-photo-symbolic',
    'toy': 'applications-games-symbolic',
};
// The laptop's own battery and chargers are already shown by GNOME.
const SKIP_KINDS = new Set(['line-power', 'battery', 'ups']);

// AirPods don't report battery over standard Bluetooth; they broadcast it in
// Apple "proximity pairing" adverts instead. While they're connected an LE
// scan runs and each advert updates the rings as it arrives.
const APPLE = 0x004c;
// Fallback check (connections, a scan BlueZ dropped, stale readings).
const REFRESH_SECONDS = 30;
// Adverts older than this don't count when picking the current reading.
const FRESH_MS = 15e3;
// Forget a reading if no advert has been seen for this long.
const STALE_MS = 3 * 60e3;

function kindOf(d) {
    return UPower.Device.kind_to_string(d.kind);
}

function isPeripheral(d) {
    return !d.power_supply && !SKIP_KINDS.has(kindOf(d)) && d.is_present;
}

function nameOf(d) {
    if (d.model) return d.model;
    const k = kindOf(d).replace('-', ' ');
    return k.charAt(0).toUpperCase() + k.slice(1);
}

// Proximity-pairing advert (manufacturer data after Apple's company id):
// [0]=0x07 [1]=length [3..4]=model, little-endian; bit 5 of [5] says which
// bud is "primary"; [6]=left/right levels; [7]=charging bits, case level.
// Levels are 0-10 (x10 %), 15 = unknown (bud in a closed case or away).
function parseAirPods(bytes) {
    if (bytes.length < 8 || bytes[0] !== 0x07) return null;
    const model = bytes[3] | bytes[4] << 8;
    const flip = (bytes[5] & 0x20) === 0;
    const hi = bytes[6] >> 4, lo = bytes[6] & 0x0f;
    const charge = bytes[7] >> 4, caseLevel = bytes[7] & 0x0f;
    const pct = v => v <= 10 ? v * 10 : null;
    return {
        model,
        left: pct(flip ? hi : lo),
        right: pct(flip ? lo : hi),
        case: pct(caseLevel),
        leftCharging: (charge & (flip ? 0b010 : 0b001)) !== 0,
        rightCharging: (charge & (flip ? 0b001 : 0b010)) !== 0,
        caseCharging: (charge & 0b100) !== 0,
    };
}

function unpackBytes(v) {
    const b = v instanceof GLib.Variant ? v.deepUnpack() : v;
    return b instanceof Uint8Array ? b : Uint8Array.from(b);
}

function levelOf(pct) {
    return pct <= LOW ? 'low' : pct <= WARN ? 'warn' : 'ok';
}

// An icon inside a ring that fills clockwise with the battery level, like
// the macOS batteries widget.
function batteryRing(part, size, lineWidth, iconSize) {
    const bin = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        width: size,
        height: size,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const area = new St.DrawingArea({width: size, height: size});
    const frac = Math.max(0, Math.min(1, part.pct / 100));
    const [r, g, b] = COLORS[part.charging ? 'ok' : levelOf(part.pct)];
    area.connect('repaint', a => {
        const cr = a.get_context();
        const [w, h] = a.get_surface_size();
        const lw = lineWidth * w / size;
        const radius = (Math.min(w, h) - lw) / 2;
        cr.setLineWidth(lw);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setSourceRGBA(1, 1, 1, 0.16);
        cr.arc(w / 2, h / 2, radius, 0, 2 * Math.PI);
        cr.stroke();
        if (frac > 0) {
            cr.setSourceRGBA(r, g, b, 1);
            cr.arc(w / 2, h / 2, radius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * frac);
            cr.stroke();
        }
        cr.$dispose();
    });
    bin.add_child(area);
    bin.add_child(new St.Icon({
        gicon: part.icon,
        icon_size: iconSize,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    }));
    return bin;
}

export default class BluetoothBattery extends Extension {
    enable() {
        // object path -> UPower.Device
        this._devices = new Map();
        // BlueZ path of a connected Apple audio device -> {alias, model, reading, seen}
        this._airpods = new Map();
        // BlueZ path of an advertiser -> {r: parsed advert, rssi, t}
        this._adverts = new Map();
        this._cancellable = new Gio.Cancellable();

        this._button = new PanelMenu.Button(0.5, this.metadata.name);
        this._button.add_style_class_name('btbat-panel');
        this._panelBox = new St.BoxLayout({
            style_class: 'btbat-pill',
            height: PILL_HEIGHT,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._button.add_child(this._panelBox);
        this._button.menu.box.add_style_class_name('btbat-menu');
        this._section = new PopupMenu.PopupMenuSection();
        this._button.menu.addMenuItem(this._section);
        this._button.menu.connect('open-state-changed', (m, open) => {
            if (open) this._refresh();
        });

        // Directly left of Now Playing, and kept there as other items load.
        Main.panel.addToStatusArea(this.uuid, this._button, 0, 'right');
        this._placeBesideMusic();
        Main.panel._rightBox.connectObject('child-added', () => {
            // After Now Playing's own handler has moved it to the front.
            if (this._placeId) return;
            this._placeId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._placeId = 0;
                this._placeBesideMusic();
                return GLib.SOURCE_REMOVE;
            });
        }, this);

        this._client = UPower.Client.new_full(null);
        // Not get_devices2(): under GJS its devices get freed while still in use.
        for (const d of this._client.get_devices())
            this._track(d);
        this._client.connectObject(
            'device-added', (c, d) => {
                this._track(d);
                this._queueSync();
            },
            'device-removed', (c, path) => {
                this._devices.get(path)?.disconnectObject(this);
                this._devices.delete(path);
                this._queueSync();
            },
            this);
        this._sync();

        // Every BlueZ device property change: connections, and adverts while
        // scanning.
        this._propsSub = Gio.DBus.system.signal_subscribe('org.bluez', 'org.freedesktop.DBus.Properties',
            'PropertiesChanged', null, 'org.bluez.Device1', Gio.DBusSignalFlags.NONE,
            (conn, sender, path, iface, signal, params) => this._onDeviceChanged(path, params.deepUnpack()[1]));
        this._refresh();
        this._refreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    // Now Playing moves itself to the front of the right side; this runs
    // after it and slots in just before it. Moving doesn't fire child-added,
    // so the two don't fight.
    _placeBesideMusic() {
        const box = Main.panel._rightBox;
        const music = Main.panel.statusArea['now-playing@arjun']?.container;
        const me = this._button?.container;
        if (!me || !music || music.get_parent() !== box) return;
        const kids = box.get_children();
        const mi = kids.indexOf(music), ci = kids.indexOf(me);
        const want = ci < mi ? mi - 1 : mi;
        if (ci !== want) box.set_child_at_index(me, want);
    }

    _track(d) {
        this._devices.set(d.get_object_path(), d);
        d.connectObject('notify', () => this._queueSync(), this);
    }

    // A device fires several notify signals at once; redraw once.
    _queueSync() {
        if (this._syncId) return;
        this._syncId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._syncId = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _bluez(path, iface, method, params, replyType = null) {
        return Gio.DBus.system.call('org.bluez', path, iface, method, params,
            replyType ? new GLib.VariantType(replyType) : null,
            Gio.DBusCallFlags.NONE, -1, this._cancellable);
    }

    async _objects() {
        const reply = await this._bluez('/', 'org.freedesktop.DBus.ObjectManager',
            'GetManagedObjects', null, '(a{oa{sa{sv}}})');
        return Object.entries(reply.deepUnpack()[0]);
    }

    _onDeviceChanged(path, changed) {
        if ('Connected' in changed) {
            this._refresh();
            return;
        }
        const data = changed.ManufacturerData?.deepUnpack()?.[APPLE];
        const r = data && parseAirPods(unpackBytes(data));
        const ad = this._adverts.get(path);
        if (r) {
            const rssi = changed.RSSI?.unpack() ?? ad?.rssi ?? -999;
            this._adverts.set(path, {r, rssi, t: Date.now()});
        } else if (ad && 'RSSI' in changed) {
            ad.rssi = changed.RSSI.unpack();
            ad.t = Date.now();
        } else {
            return;
        }
        this._applyAdverts();
    }

    // Picks each connected AirPods' reading from fresh adverts of the same
    // model; the strongest wins, since the buds you're wearing are closest.
    _applyAdverts() {
        const now = Date.now();
        let changed = false;
        for (const [path, ad] of this._adverts) {
            if (now - ad.t > STALE_MS) this._adverts.delete(path);
        }
        for (const a of this._airpods.values()) {
            let best = null;
            for (const ad of this._adverts.values()) {
                if (ad.r.model === a.model && now - ad.t < FRESH_MS && (!best || ad.rssi > best.rssi))
                    best = ad;
            }
            const before = JSON.stringify(a.reading);
            if (best) {
                a.reading = best.r;
                a.seen = best.t;
            } else if (now - a.seen > STALE_MS) {
                a.reading = null;
            }
            changed ||= JSON.stringify(a.reading) !== before;
        }
        if (changed) this._queueSync();
    }

    // Finds connected Apple headphones and keeps an LE scan running only
    // while there are some.
    async _refresh() {
        if (this._refreshing) {
            this._refreshAgain = true;
            return;
        }
        this._refreshing = true;
        try {
            let adapter = null;
            const connected = new Map();
            const objects = await this._objects();
            for (const [path, ifaces] of objects) {
                if (ifaces['org.bluez.Adapter1']?.Powered?.unpack()) adapter ??= path;
                const d = ifaces['org.bluez.Device1'];
                const m = d?.Modalias?.unpack().match(/^bluetooth:v004Cp([0-9A-F]{4})/i);
                if (m && d.Connected?.unpack() && d.Icon?.unpack().startsWith('audio'))
                    connected.set(path, {alias: d.Alias?.unpack() ?? 'AirPods', model: parseInt(m[1], 16)});
            }
            if (!this._button) return;
            for (const path of [...this._airpods.keys()]) {
                if (!connected.has(path)) this._airpods.delete(path);
            }
            for (const [path, info] of connected) {
                const old = this._airpods.get(path);
                this._airpods.set(path, {...info, reading: old?.reading ?? null, seen: old?.seen ?? 0});
            }

            if (connected.size && adapter) {
                // Adverts BlueZ already has, so the rings fill in straight away.
                for (const [path, ifaces] of objects) {
                    const d = ifaces['org.bluez.Device1'];
                    const data = d?.ManufacturerData?.deepUnpack()?.[APPLE];
                    const r = data && parseAirPods(unpackBytes(data));
                    if (r && !this._adverts.has(path))
                        this._adverts.set(path, {r, rssi: d.RSSI?.unpack() ?? -999, t: Date.now()});
                }
                await this._startDiscovery(adapter);
            } else {
                this._stopDiscovery();
            }
            this._applyAdverts();
            this._queueSync();
        } catch (e) {
            if (this._button && !e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.error(`${this.uuid}: ${e}`);
        } finally {
            this._refreshing = false;
            if (this._refreshAgain && this._button) {
                this._refreshAgain = false;
                this._refresh();
            }
        }
    }

    // Called on every refresh: if BlueZ dropped the scan (adapter reset,
    // suspend) this starts it again; if it's running, BlueZ says InProgress.
    async _startDiscovery(adapter) {
        await this._bluez(adapter, 'org.bluez.Adapter1', 'SetDiscoveryFilter',
            new GLib.Variant('(a{sv})', [{
                Transport: new GLib.Variant('s', 'le'),
                DuplicateData: new GLib.Variant('b', true),
            }]));
        try {
            await this._bluez(adapter, 'org.bluez.Adapter1', 'StartDiscovery', null);
        } catch (e) {
            if (!Gio.DBusError.get_remote_error(e)?.endsWith('InProgress')) throw e;
        }
        this._discovering = adapter;
    }

    // Not tied to the cancellable, so it still runs from disable().
    _stopDiscovery() {
        if (!this._discovering) return;
        Gio.DBus.system.call('org.bluez', this._discovering, 'org.bluez.Adapter1', 'StopDiscovery',
            null, null, Gio.DBusCallFlags.NONE, -1, null).catch(() => {});
        this._discovering = null;
    }

    // One group per physical device: {name, parts: [{icon, label, pct,
    // charging, inPanel}]}. Only parts that are actually reporting are
    // included, so a single AirPod shows on its own.
    _groups() {
        const themed = name => Gio.ThemedIcon.new(name);
        const file = name => Gio.icon_new_for_string(`${this.path}/icons/${name}.svg`);
        const groups = [];
        for (const d of [...this._devices.values()].filter(isPeripheral)) {
            const kind = kindOf(d);
            groups.push({name: nameOf(d), parts: [{
                icon: themed(ICONS[kind] ?? 'bluetooth-active-symbolic'),
                label: kind === 'unknown' ? 'Battery' : kind.charAt(0).toUpperCase() + kind.slice(1).replace('-', ' '),
                pct: Math.round(d.percentage),
                charging: d.state === UPower.DeviceState.CHARGING,
                inPanel: true,
            }]});
        }
        for (const a of this._airpods.values()) {
            const r = a.reading;
            if (!r) continue;
            const parts = [
                ['Left', 'earbud-left', r.left, r.leftCharging, true],
                ['Right', 'earbud-right', r.right, r.rightCharging, true],
                ['Case', 'case', r.case, r.caseCharging, false],
            ].filter(([, , pct]) => pct !== null)
                .map(([label, icon, pct, charging, inPanel]) => ({icon: file(icon), label, pct, charging, inPanel}));
            // Only the case reporting (buds away): show it in the panel then.
            if (parts.length && !parts.some(p => p.inPanel)) parts[0].inPanel = true;
            if (parts.length) groups.push({name: a.alias, parts});
        }
        return groups;
    }

    _sync() {
        const groups = this._groups();
        this._button.visible = groups.length > 0;

        this._panelBox.destroy_all_children();
        for (const part of groups.flatMap(g => g.parts.filter(p => p.inPanel)).slice(0, MAX_IN_PANEL))
            this._panelBox.add_child(batteryRing(part, 18, 2, 10));

        this._section.removeAll();
        for (const g of groups) {
            const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
            const box = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'btbat-device'});
            box.add_child(new St.Label({text: g.name, style_class: 'btbat-name'}));
            const tiles = new St.BoxLayout({style_class: 'btbat-tiles'});
            for (const part of g.parts) {
                const tile = new St.BoxLayout({vertical: true, style_class: 'btbat-tile'});
                const ring = batteryRing(part, 44, 3.5, 20);
                ring.x_align = Clutter.ActorAlign.CENTER;
                tile.add_child(ring);
                tile.add_child(new St.Label({
                    text: part.charging ? `${part.label} · charging` : part.label,
                    style_class: 'btbat-tile-label',
                    x_align: Clutter.ActorAlign.CENTER,
                }));
                tiles.add_child(tile);
            }
            box.add_child(tiles);
            item.add_child(box);
            this._section.addMenuItem(item);
        }
    }

    disable() {
        if (this._propsSub) {
            Gio.DBus.system.signal_unsubscribe(this._propsSub);
            this._propsSub = 0;
        }
        Main.panel._rightBox.disconnectObject(this);
        for (const id of ['_syncId', '_refreshId', '_placeId']) {
            if (this[id]) {
                GLib.source_remove(this[id]);
                this[id] = 0;
            }
        }
        this._cancellable?.cancel();
        this._stopDiscovery();
        for (const d of this._devices.values()) d.disconnectObject(this);
        this._client?.disconnectObject(this);
        this._button?.destroy();
        this._button = this._panelBox = this._section = this._client = this._devices = null;
        this._airpods = this._adverts = this._cancellable = null;
        this._refreshing = this._refreshAgain = false;
    }
}
