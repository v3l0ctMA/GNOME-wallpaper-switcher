# Wallpaper Switcher — GNOME Shell Extension

A panel extension for GNOME that lets you browse and apply wallpapers from a folder of your choosing. Features a live-preview grid or carousel view, auto-rotate timer, and a global hotkey for instant random wallpaper switching.

Tested on **GNOME 50** (Solus Linux). Should work on GNOME 45 and later.

---

## Features

- **Grid view** — 3×3 thumbnail grid with filenames, browse page by page
- **Carousel view** — single large image, scroll through one at a time
- **View toggle** — switch between grid and carousel on the fly, preference persists
- **Live preview** — desktop wallpaper updates in real time as you browse
- **Filenames** — shown under each thumbnail in both views
- **Rename** — click any filename to rename it inline; saves to disk immediately
- **Wrap-around** — carousel scrolls infinitely in either direction
- **R for random** — press R in carousel view to jump to a random wallpaper
- **Global hotkey** — press `Super+Alt+W` anywhere to apply a random wallpaper instantly
- **Auto-rotate** — randomly changes wallpaper on a timer, toggle and interval adjustable inline
- **Skip button** — appears when auto-rotate is on; picks a new random and resets the timer
- **Subfolder support** — optionally scan subfolders recursively
- **File monitoring** — new images added to or removed from the folder are picked up automatically
- **Scaling modes** — zoom, scaled, stretched, centered, or tiled
- **Panel position** — left, center, or right section of the top bar
- **Right-click** the panel icon to open Settings directly

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
4. Click the panel icon — your wallpapers appear immediately

---

## Grid view

The default view shows a 3×3 grid of thumbnails with filenames underneath.

| Action | Result |
|--------|--------|
| ← → arrow keys | Move selection one image at a time |
| ↑ ↓ arrow keys | Jump a full page up or down |
| Scroll wheel | Jump a full page up or down |
| Click any thumbnail | Select it and live preview on desktop |
| Click selected thumbnail or Enter | Apply wallpaper and close |
| Click a filename | Rename it inline (Enter to confirm, Esc to cancel) |
| **Esc** | Revert to wallpaper set before opening and close |

---

## Carousel view

Shows one large image at a time with the filename and position counter below.

| Action | Result |
|--------|--------|
| ← → arrow keys or scroll wheel | Browse one image at a time (wraps around) |
| Click image or Enter | Apply wallpaper and close |
| Click filename | Rename it inline (Enter to confirm, Esc to cancel) |
| **Esc** | Revert to wallpaper set before opening and close |

---

## Bottom bar

Both views share the same bottom bar:

```
[ ▶▶ ]  [ ⌨ Super+Alt+W ]      [ Skip ] [ ⏱ 10 min ] [ ⊞ ] [ ⚙ ] [ 🔀 ]
```

| Button | Description |
|--------|-------------|
| **▶▶** | Apply a random wallpaper instantly (one-shot, no timer) |
| **⌨ Super+Alt+W** | Reminder of the global hotkey |
| **Skip** | New random wallpaper + reset timer (auto-rotate on only) |
| **⏱ N min** | Cycle through intervals: 1 / 5 / 10 / 15 / 30 / 60 min — saves immediately (auto-rotate on only) |
| **⊞ / ▤** | Toggle between grid and carousel view — saves preference |
| **⚙** | Open Settings |
| **🔀** | Toggle auto-rotate on/off — glows bright when on, faded when off — saves immediately |

---

## Global hotkey

Press **`Super+Alt+W`** at any time — on the desktop, inside an app, anywhere — to instantly apply a random wallpaper. No popup opens. Independent of the auto-rotate timer.

---

## Auto-rotate

When enabled the wallpaper changes randomly at the chosen interval in the background. Toggle and interval are both adjustable directly in the bottom bar without opening settings. When auto-rotate is on, a **Skip** button appears to immediately jump to a new random wallpaper and reset the countdown.

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
| Wallpaper scaling | Zoom, Scaled, Stretched, Centered, Tiled | How the image fits the screen. **Zoom** (default) fills and crops; **Scaled** fits with letterboxing |

### Auto-rotate
| Setting | Description |
|---------|-------------|
| Enable auto-rotate | Also toggled directly from the bottom bar shuffle icon |
| Interval | 1, 5, 10, 15, 30, or 60 min — also adjustable from the bottom bar |

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

## Budgie version

Not currently available. If there's enough interest from Budgie users, open an issue and let me know — demand will determine whether it's worth the effort.

---

## Troubleshooting

**Extension shows as errored**
Check the logs: `journalctl -f /usr/bin/gnome-shell`

**Hotkey not working**
Check System Settings → Keyboard → Keyboard Shortcuts for conflicts with `Super+Alt+W`.

**Thumbnails not appearing**
Files load lazily so there may be a brief moment with grey placeholders on first open.

**Wallpaper not changing**
Verify `gsettings get org.gnome.desktop.background picture-uri` works without errors.

**Schema errors on install**
Make sure `glib-compile-schemas` is installed (see Requirements above).
