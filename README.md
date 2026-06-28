# Wallpaper Switcher — GNOME Shell Extension

A panel extension for GNOME that lets you browse and apply wallpapers from a folder of your choosing, with a live-preview card carousel, optional random auto-rotate timer, and a global hotkey for instant random wallpaper switching.

Tested on **GNOME 50** (Solus Linux). Should work on GNOME 45 and later.

---

## Features

- **Live carousel** — scroll through wallpaper thumbnails in a panel popup; the desktop updates in real time as you browse
- **Wrap-around** — scrolling past the last image loops back to the first, so you can scroll in one direction indefinitely
- **R for random** — press R in the carousel to jump to a random wallpaper instantly
- **Global hotkey** — press `Super+Alt+W` anywhere on the desktop to apply a random wallpaper instantly, no carousel needed
- **Auto-rotate** — toggle random auto-rotate on/off directly in the carousel via the shuffle icon; interval is also adjustable inline
- **Skip button** — appears when auto-rotate is on; picks a new random wallpaper and resets the timer
- **Subfolder support** — optionally scan subfolders of your chosen folder recursively
- **File monitoring** — new images added to or removed from the folder are picked up automatically
- **Scaling modes** — zoom, scaled, stretched, centered, or tiled
- **Panel position** — place the icon in the left, center, or right section of the top bar
- **Right-click** the panel icon at any time to open Settings

---

## Requirements

- GNOME Shell 45 or later
- `make` and `glib-compile-schemas`

### Installing build dependencies

| Distro | Command |
|--------|---------|
| Solus  | `sudo eopkg install make` or `sudo eopkg install -c system.devel` |
| Ubuntu / Debian | `sudo apt install make libglib2.0-bin` |
| Fedora | `sudo dnf install make glib2-devel` |
| Arch   | `sudo pacman -S make glib2` |

---

## Installation

1. Download and unzip `wallpaper-switcher.zip`
2. Open a terminal in the extracted `wallpaper-switcher/` folder
3. Run:

```bash
make install
```

4. Enable the extension:

```bash
gnome-extensions enable wallpaper-switcher@local
```

5. **Log out and log back in** (required on Wayland)

On X11 you can instead press `Alt+F2`, type `r`, and press Enter to restart the shell in place.

---

## First-time setup

1. **Right-click** the wallpaper icon in the panel to open **Settings**
2. Under **Wallpaper folder**, click **Choose…** and select the folder containing your images
3. Adjust any other settings to your preference
4. Click the panel icon — your wallpapers appear in the carousel immediately

---

## Using the carousel

| Action | Result |
|--------|--------|
| Scroll wheel or ← → arrow keys | Browse wallpapers (desktop updates live) |
| Click a side card | Move it to the center |
| Click the center card or Enter | Apply the wallpaper and close |
| **R** | Jump to a random wallpaper |
| **Esc** | Revert to the wallpaper set before opening and close |
| **Super+Alt+W** | Apply a random wallpaper instantly (works anywhere, carousel stays closed) |
| **Right-click** the panel icon | Open Settings directly |

### Button row (bottom of carousel)

```
[ Skip ]  [ ⏱ 10 min ]               [ ⚙ ]  [ 🔀 ]
```

| Button | Description |
|--------|-------------|
| **Skip** | Pick a new random wallpaper and reset the timer (auto-rotate on only) |
| **⏱ N min** | Cycle through intervals: 1 / 5 / 10 / 15 / 30 / 60 min — saves immediately (auto-rotate on only) |
| **⚙** | Open Settings |
| **🔀** | Toggle auto-rotate on/off — glows bright when on, faded when off — saves immediately |

---

## Global hotkey

Press **`Super+Alt+W`** at any time — on the desktop, inside an app, anywhere — to instantly apply a random wallpaper from your folder. No carousel opens, no popup appears, the wallpaper just silently changes. Independent of the auto-rotate timer.

---

## Auto-rotate

When enabled the wallpaper changes randomly at the chosen interval in the background. Toggle it and adjust the interval directly in the carousel without opening settings.

---

## Settings reference

### Wallpaper folder
| Setting | Description |
|---------|-------------|
| Folder | The folder to scan for images (jpg, png, webp, bmp, tiff) |
| Include subfolders | Also scan subfolders recursively (off by default) |

### Appearance
| Setting | Options | Description |
|---------|---------|-------------|
| Panel position | Left, Center, Right | Where the icon appears in the top bar |
| Wallpaper scaling | Zoom, Scaled, Stretched, Centered, Tiled | How the image fits the screen |

### Auto-rotate
| Setting | Description |
|---------|-------------|
| Enable auto-rotate | Also controllable directly from the carousel shuffle icon |
| Interval | 1, 5, 10, 15, 30, or 60 min — also adjustable from the carousel |

### Keyboard shortcut
| Shortcut | Action |
|----------|--------|
| `Super+Alt+W` | Apply a random wallpaper instantly |

---

## Updating

```bash
cd wallpaper-switcher
make install
```

Then log out and back in.

---

## Uninstalling

```bash
cd wallpaper-switcher
make uninstall
gnome-extensions disable wallpaper-switcher@local
```

---

## Supported image formats

`.jpg` `.jpeg` `.png` `.webp` `.bmp` `.tiff` `.tif`

---

## Troubleshooting

**Extension shows as errored**
Check the logs: `journalctl -f /usr/bin/gnome-shell`

**Hotkey not working**
Make sure no other application or extension has claimed `Super+Alt+W`. Check System Settings → Keyboard → Keyboard Shortcuts.

**Thumbnails not appearing**
Files load lazily so there may be a brief moment with grey placeholders on first open.

**Wallpaper not changing**
Verify `gsettings get org.gnome.desktop.background picture-uri` works without errors.

**Schema errors on install**
Make sure `glib-compile-schemas` is installed (see Requirements above).
