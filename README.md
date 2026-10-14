# Audio Battery for GNOME

A GNOME Shell extension that shows the battery of your AirPods, headphones, headsets and speakers in the top bar, as rings around each device's icon, like the batteries widget on macOS.

![AirPods battery rings in the top bar](screenshots/panel.png)

- Rings sit together in a rounded pill that matches the [Now Playing](https://github.com/voidrlm/gnome-now-playing) pill, just left of it when that extension is installed
- Each ring fills with the battery level: green, yellow at 40% or below, red at 20% or below, green while charging
- Click to see each device with larger rings and labels
- Hidden when no audio device with a battery is connected
- Only audio devices are shown; mice, keyboards and the like are left out

## AirPods

AirPods don't report battery over standard Bluetooth, so the extension reads the battery broadcast they send to iPhones instead:

- Separate rings for the left bud, right bud and case
- Only what's actually reporting is shown: wear just the left AirPod and you get just a left earbud ring
- The case appears in the menu (in the top bar only when it's the only thing reporting)
- Levels come in steps of 10%

While Apple headphones are connected it keeps a low-energy Bluetooth scan running, so the rings update the moment you take a bud out or put it back. The scan stops as soon as they disconnect, and only broadcasts from the same model as your connected AirPods are used.

## Other headphones and speakers

Any headphones, headset or speaker that reports its battery to Linux (through UPower) gets its own ring.

Requires GNOME Shell 50.

<details><summary>Where it sits in the top bar</summary>

![The whole top bar](screenshots/top-bar.png)

</details>

## Install

```bash
git clone https://github.com/voidrlm/gnome-audio-battery.git ~/.local/share/gnome-shell/extensions/audio-battery@arjun
```

Log out and back in, then enable it:

```bash
gnome-extensions enable audio-battery@arjun
```

## Update

```bash
git -C ~/.local/share/gnome-shell/extensions/audio-battery@arjun pull
```

Then log out and back in.
