# Bluetooth Battery for GNOME

A GNOME Shell extension that shows the battery of your Bluetooth and wireless devices in the top bar, as rings around each device's icon, like the batteries widget on macOS.

- Each ring fills with the battery level: green, yellow at 40% or below, red at 20% or below, green while charging
- Click to see every device, with larger rings and labels
- Hidden when nothing with a battery is connected

## AirPods

AirPods don't report battery over standard Bluetooth, so the extension reads the battery broadcast they send to iPhones instead:

- Separate rings for the left bud, right bud and case
- Only what's actually reporting is shown: wear just the left AirPod and you get just a left earbud ring
- The case appears in the menu (in the top bar only when it's the only thing reporting)
- Levels come in steps of 10%

While Apple headphones are connected it keeps a low-energy Bluetooth scan running, so the rings update the moment you take a bud out or put it back. The scan stops as soon as they disconnect, and only broadcasts from the same model as your connected AirPods are used.

## Other devices

The rings sit just left of the [Now Playing](https://github.com/voidrlm/gnome-now-playing) pill when that extension is installed.

Anything that reports its battery to Linux (through UPower) is shown with a matching icon: headphones, headsets, speakers, mice, keyboards, touchpads, game controllers, pens and tablets, phones, remotes, cameras and more. Up to 4 rings fit in the top bar; the menu lists everything.

Requires GNOME Shell 50.

## Install

```bash
git clone https://github.com/voidrlm/gnome-bluetooth-battery.git ~/.local/share/gnome-shell/extensions/bluetooth-battery@arjun
```

Log out and back in, then enable it:

```bash
gnome-extensions enable bluetooth-battery@arjun
```

## Update

```bash
git -C ~/.local/share/gnome-shell/extensions/bluetooth-battery@arjun pull
```

Then log out and back in.
