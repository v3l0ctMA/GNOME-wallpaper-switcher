import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// ─── constants ────────────────────────────────────────────────────────────────

const SCHEMA_ID  = 'org.gnome.shell.extensions.wallpaper-switcher';
const BG_SCHEMA  = 'org.gnome.desktop.background';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif']);

// Grid dimensions
const GRID_COLS    = 3;
const GRID_THUMB_W = 174;
const GRID_THUMB_H = 107;
const GRID_GAP     = 10;
const GRID_LABEL_H = 26;
const GRID_ROWS    = 3;
const POPUP_PAD    = 12;

// Derived sizes
const CONTENT_W  = GRID_COLS * GRID_THUMB_W + (GRID_COLS - 1) * GRID_GAP;
const GRID_H     = GRID_ROWS * (GRID_THUMB_H + GRID_LABEL_H) + (GRID_ROWS - 1) * GRID_GAP;
const HINT_H     = 20;
const CONTENT_H  = GRID_H + HINT_H;
const POPUP_W    = CONTENT_W + POPUP_PAD * 2;
const BTNBAR_H   = 34;
const POPUP_H    = CONTENT_H + BTNBAR_H + POPUP_PAD * 2 + 8;

// Carousel: thumb fills content minus label row
const CAR_W      = CONTENT_W;
const CAR_LABEL_H = 28;
const CAR_H      = CONTENT_H - CAR_LABEL_H - 6;

const INTERVAL_MINS = [1, 5, 10, 15, 30, 60];

// ─── helpers ──────────────────────────────────────────────────────────────────

function isImage(name) {
    const dot = name.lastIndexOf('.');
    if (dot === -1) return false;
    return IMAGE_EXTS.has(name.slice(dot).toLowerCase());
}

function listImages(folderPath, recursive) {
    if (!folderPath) return [];
    const results = [];
    function scan(dir) {
        try {
            const gdir       = Gio.File.new_for_path(dir);
            const enumerator = gdir.enumerate_children(
                'standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null
            );
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                const type = info.get_file_type();
                const full = GLib.build_filenamev([dir, name]);
                if (type === Gio.FileType.REGULAR && isImage(name))
                    results.push(full);
                else if (recursive && type === Gio.FileType.DIRECTORY)
                    scan(full);
            }
            enumerator.close(null);
        } catch (_) {}
    }
    scan(folderPath);
    results.sort();
    return results;
}

function setWallpaper(path, pictureOptions) {
    const uri = GLib.filename_to_uri(path, null);
    const bg  = new Gio.Settings({ schema_id: BG_SCHEMA });
    bg.set_string('picture-uri',      uri);
    bg.set_string('picture-uri-dark', uri);
    bg.set_string('picture-options',  pictureOptions ?? 'zoom');
    bg.apply();
}

function thumbStyle(w, h, path) {
    const esc = path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `width:${w}px;height:${h}px;border-radius:6px;background-image:url('${esc}');background-size:cover;background-position:center;`;
}

function randomOther(files, cur) {
    if (files.length <= 1) return files[0] ?? null;
    let p;
    do { p = files[Math.floor(Math.random() * files.length)]; } while (p === cur);
    return p;
}

function baseName(path) {
    return GLib.path_get_basename(path).replace(/\.[^.]+$/, '');
}

function intervalLabel(m) { return m === 60 ? '1 hr' : `${m} min`; }

function renameFile(oldPath, newName) {
    try {
        const file = Gio.File.new_for_path(oldPath);
        const ext  = GLib.path_get_basename(oldPath).replace(/^[^.]+/, '');
        return file.set_display_name(newName + ext, null).get_path();
    } catch (_) { return null; }
}

// ─── inline rename helper ─────────────────────────────────────────────────────

function startRename(parentActor, labelBtn, currentName, x, y, w, h, onCommit) {
    labelBtn.hide();
    const entry = new St.Entry({
        text:  currentName,
        style: `width:${w}px;height:${h}px;font-size:10px;border-radius:4px;padding:2px 4px;`,
    });
    entry.set_position(x, y);
    parentActor.add_child(entry);
    entry.grab_key_focus();
    entry.get_clutter_text().set_selection(0, -1);

    const commit = () => {
        const n = entry.get_text().trim();
        entry.destroy();
        labelBtn.show();
        if (n) onCommit(n);
    };
    entry.get_clutter_text().connect('activate', commit);
    entry.connect('key-press-event', (_a, ev) => {
        if (ev.get_key_symbol() === Clutter.KEY_Escape) {
            entry.destroy();
            labelBtn.show();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
}

// ─── BottomBar ────────────────────────────────────────────────────────────────

class BottomBar {
    constructor(settings, viewMode, onRandom, onSettings, onViewToggle) {
        this._settings = settings;
        this._onSkip   = null;

        this.actor = new St.BoxLayout({
            vertical: false,
            style:    `width:${CONTENT_W}px; padding-top:6px;`,
        });

        // ── left ──────────────────────────────────────────────────────────────
        this._leftBox = new St.BoxLayout({ vertical: false, style: 'spacing:6px;', x_expand: true });
        this.actor.add_child(this._leftBox);

        // One-shot random button
        const randBtn = new St.Button({
            child:  new St.Icon({ icon_name: 'media-skip-forward-symbolic', icon_size: 13 }),
            style:  'padding:3px 6px;border-radius:6px;background-color:rgba(255,255,255,0.1);',
            reactive: true,
        });
        randBtn.connect('clicked', () => onRandom());
        this._leftBox.add_child(randBtn);

        // Nav hint (shown in carousel mode, hidden in grid)
        this._navHint = new St.Label({
            text:  '← →  •  scroll',
            style: 'font-size:10px;color:rgba(255,255,255,0.28);',
        });
        this._leftBox.add_child(this._navHint);

        // Hotkey chip
        const chip = new St.BoxLayout({
            vertical: false,
            style:    'padding:3px 6px;border-radius:6px;background-color:rgba(255,255,255,0.06);spacing:3px;',
        });
        chip.add_child(new St.Icon({ icon_name: 'input-keyboard-symbolic', icon_size: 11,
            style: 'color:rgba(255,255,255,0.4);' }));
        chip.add_child(new St.Label({ text: 'Super+Alt+W',
            style: 'font-size:10px;color:rgba(255,255,255,0.4);' }));
        this._leftBox.add_child(chip);

        // ── right ─────────────────────────────────────────────────────────────
        const right = new St.BoxLayout({ vertical: false, style: 'spacing:4px;' });
        this.actor.add_child(right);

        // Skip (auto-rotate only)
        this._skipBtn = new St.Button({
            label: 'Skip',
            style: 'padding:3px 8px;border-radius:6px;background-color:rgba(255,255,255,0.12);font-size:11px;',
        });
        this._skipBtn.connect('clicked', () => this._onSkip?.());
        right.add_child(this._skipBtn);

        // Interval cycle button (auto-rotate only)
        this._intervalBtn = new St.Button({
            label: '',
            style: 'padding:3px 6px;border-radius:6px;background-color:rgba(255,255,255,0.08);font-size:11px;',
        });
        this._intervalBtn.connect('clicked', () => {
            const cur  = settings.get_int('rotate-interval');
            const idx  = Math.max(0, INTERVAL_MINS.indexOf(cur));
            settings.set_int('rotate-interval', INTERVAL_MINS[(idx + 1) % INTERVAL_MINS.length]);
        });
        right.add_child(this._intervalBtn);

        // View toggle
        this._viewBtn = new St.Button({
            child:  new St.Icon({ icon_name: 'view-grid-symbolic', icon_size: 13 }),
            style:  'padding:3px 6px;border-radius:6px;background-color:rgba(255,255,255,0.08);',
        });
        this._viewBtn.connect('clicked', () => onViewToggle());
        right.add_child(this._viewBtn);

        // Settings
        const settBtn = new St.Button({
            child:  new St.Icon({ icon_name: 'emblem-system-symbolic', icon_size: 13 }),
            style:  'padding:3px 6px;border-radius:6px;background-color:rgba(255,255,255,0.08);',
        });
        settBtn.connect('clicked', () => onSettings());
        right.add_child(settBtn);

        // Auto-rotate shuffle toggle (keeps shuffle icon — distinct role from skip-forward)
        this._shuffleBtn = new St.Button({
            child:  new St.Icon({ icon_name: 'media-playlist-shuffle-symbolic', icon_size: 13 }),
            style:  '',
        });
        this._shuffleBtn.connect('clicked', () => {
            settings.set_boolean('auto-rotate', !settings.get_boolean('auto-rotate'));
        });
        right.add_child(this._shuffleBtn);

        this._autoId     = settings.connect('changed::auto-rotate',     () => this.sync());
        this._intervalId = settings.connect('changed::rotate-interval', () => this.sync());

        this.setViewMode(viewMode);
        this.sync();
    }

    setSkipCallback(cb) { this._onSkip = cb; }

    setViewMode(mode) {
        const icon = mode === 'grid' ? 'media-optical-symbolic' : 'view-grid-symbolic';
        this._viewBtn.get_child().set_icon_name(icon);
        // Show nav hint only in carousel — grid has its own hint row
        this._navHint.visible = (mode === 'carousel');
    }

    sync() {
        const on   = this._settings.get_boolean('auto-rotate');
        const mins = this._settings.get_int('rotate-interval');
        this._shuffleBtn.style = on
            ? 'padding:3px 6px;border-radius:6px;background-color:rgba(255,255,255,0.18);color:#78d4f0;'
            : 'padding:3px 6px;border-radius:6px;background-color:rgba(255,255,255,0.06);opacity:0.45;';
        this._skipBtn.visible     = on;
        this._intervalBtn.visible = on;
        if (on) this._intervalBtn.set_label(`⏱ ${intervalLabel(mins)}`);
    }

    destroy() {
        this._settings.disconnect(this._autoId);
        this._settings.disconnect(this._intervalId);
    }
}

// ─── GridView ─────────────────────────────────────────────────────────────────

class GridView {
    constructor(files, currentPath, onPreview, onConfirm, onRename) {
        this._files     = files;
        this._sel       = Math.max(0, files.indexOf(currentPath));
        this._onPreview = onPreview;
        this._onConfirm = onConfirm;
        this._onRename  = onRename;
        this._confirmed = false;
        this._idleId    = null;
        this._cache     = new Map();

        const PER      = GRID_COLS * GRID_ROWS;
        this._per      = PER;
        this._pages    = Math.max(1, Math.ceil(files.length / PER));
        this._page     = Math.floor(this._sel / PER);

        this.actor = new St.Widget({
            style:     `width:${CONTENT_W}px;height:${CONTENT_H}px;`,
            reactive:  true,
            can_focus: true,
        });

        this._grid = new St.Widget({ style: `width:${CONTENT_W}px;height:${CONTENT_H}px;` });
        this.actor.add_child(this._grid);

        this._buildPage();

        // Keys: ← → single step, ↑ ↓ page jump
        this.actor.connect('key-press-event', (_a, ev) => {
            const sym = ev.get_key_symbol();
            if (sym === Clutter.KEY_Left)  { this._step(-1);          return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Right) { this._step(+1);          return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Up)    { this._jumpPage(-1);      return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Down)  { this._jumpPage(+1);      return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) {
                this._confirmed = true;
                this._onConfirm(this._files[this._sel]);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Scroll wheel = page jump
        this.actor.connect('scroll-event', (_a, ev) => {
            const dir = ev.get_scroll_direction();
            if (dir === Clutter.ScrollDirection.DOWN) this._jumpPage(+1);
            if (dir === Clutter.ScrollDirection.UP)   this._jumpPage(-1);
            return Clutter.EVENT_STOP;
        });
    }

    _buildPage() {
        this._grid.remove_all_children();
        if (this._idleId !== null) { GLib.source_remove(this._idleId); this._idleId = null; }

        const start   = this._page * this._per;
        const end     = Math.min(start + this._per, this._files.length);
        const pending = [];

        for (let i = start; i < end; i++) {
            const pos = i - start;
            const col = pos % GRID_COLS;
            const row = Math.floor(pos / GRID_COLS);
            const x   = col * (GRID_THUMB_W + GRID_GAP);
            const y   = row * (GRID_THUMB_H + GRID_LABEL_H + GRID_GAP);

            const cell = this._makeCell(i, x, y);
            this._grid.add_child(cell);

            if (this._cache.has(this._files[i])) this._applyThumb(i);
            else pending.push(i);
        }

        // Page counter + nav hint
        // Hint + page counter on one line
        const hintRow = new St.BoxLayout({
            vertical: false,
            style:    `width:${CONTENT_W}px; spacing:0px;`,
        });
        hintRow.set_position(0, GRID_H + 2);

        const navHint = new St.Label({
            text:    '← →  one by one   ↑ ↓  page',
            style:   'font-size:10px;color:rgba(255,255,255,0.28);',
            x_expand: true,
        });
        hintRow.add_child(navHint);

        const pip = new St.Label({
            text:  this._pages > 1 ? `${this._page + 1} / ${this._pages}` : `1 / ${this._pages}`,
            style: 'font-size:10px;color:rgba(255,255,255,0.3);',
        });
        hintRow.add_child(pip);
        this._grid.add_child(hintRow);

        // Load thumbnails — selected card first
        const queue = [this._sel, ...pending].filter((v, i, a) => a.indexOf(v) === i)
            .filter(i => i >= start && i < end && !this._cache.has(this._files[i]));
        this._loadQueue(queue);
    }

    _makeCell(i, x, y) {
        const isSel = i === this._sel;
        const cell  = new St.Widget({
            style:    `width:${GRID_THUMB_W}px;height:${GRID_THUMB_H + GRID_LABEL_H}px;`,
            reactive: true,
        });
        cell.set_position(x, y);

        // Thumbnail button
        const thumb = new St.Button({
            style: isSel
                ? `${thumbStyle(GRID_THUMB_W, GRID_THUMB_H, '')}border:2px solid rgba(255,255,255,0.75);border-radius:6px;background-color:rgba(128,128,128,0.2);`
                : `width:${GRID_THUMB_W}px;height:${GRID_THUMB_H}px;border-radius:6px;border:2px solid transparent;background-color:rgba(128,128,128,0.2);`,
            clip_to_allocation: true,
        });
        thumb._idx        = i;
        thumb._thumbLoaded = false;
        thumb.connect('clicked', () => {
            if (i === this._sel) {
                this._confirmed = true;
                this._onConfirm(this._files[i]);
            } else {
                this._sel  = i;
                this._page = Math.floor(i / this._per);
                this._buildPage();
                this._onPreview(this._files[i]);
            }
        });
        cell.add_child(thumb);
        cell._thumb = thumb;

        // Clickable label for rename
        const labelBtn = new St.Button({
            style: `width:${GRID_THUMB_W}px;height:${GRID_LABEL_H - 2}px;`,
        });
        labelBtn.set_child(new St.Label({
            text:  baseName(this._files[i]),
            style: `font-size:10px;color:rgba(255,255,255,0.65);text-align:center;width:${GRID_THUMB_W}px;`,
        }));
        labelBtn.set_position(0, GRID_THUMB_H + 2);
        labelBtn.connect('clicked', () => {
            startRename(cell, labelBtn, baseName(this._files[i]),
                0, GRID_THUMB_H + 2, GRID_THUMB_W, GRID_LABEL_H - 2,
                (newName) => {
                    const newPath = renameFile(this._files[i], newName);
                    if (newPath) {
                        this._files[i] = newPath;
                        labelBtn.get_child().set_text(newName);
                        this._onRename(i, newPath);
                    }
                }
            );
        });
        cell.add_child(labelBtn);
        cell._labelBtn = labelBtn;

        return cell;
    }

    _loadQueue(queue) {
        if (queue.length === 0) return;
        const next = () => {
            this._idleId = null;
            const i = queue.shift();
            if (i !== undefined) {
                this._cache.set(this._files[i], true);
                this._applyThumb(i);
                if (queue.length > 0)
                    this._idleId = GLib.idle_add(GLib.PRIORITY_LOW, next);
            }
            return GLib.SOURCE_REMOVE;
        };
        this._idleId = GLib.idle_add(GLib.PRIORITY_LOW, next);
    }

    _applyThumb(i) {
        const start = this._page * this._per;
        const pos   = i - start;
        if (pos < 0 || pos >= this._per) return;
        const children = this._grid.get_children();
        const cell     = children[pos];
        if (!cell || !cell._thumb || cell._thumb._thumbLoaded) return;
        const isSel  = i === this._sel;
        const border = isSel ? '2px solid rgba(255,255,255,0.75)' : '2px solid transparent';
        cell._thumb.style = `${thumbStyle(GRID_THUMB_W, GRID_THUMB_H, this._files[i])}border:${border};border-radius:6px;`;
        cell._thumb._thumbLoaded = true;
    }

    _step(delta) {
        const next = Math.max(0, Math.min(this._files.length - 1, this._sel + delta));
        if (next === this._sel) return;
        this._sel  = next;
        this._page = Math.floor(next / this._per);
        this._buildPage();
        this._onPreview(this._files[next]);
    }

    _jumpPage(delta) {
        const next = Math.max(0, Math.min(this._pages - 1, this._page + delta));
        if (next === this._page) return;
        this._page = next;
        // Move selection to first item of new page
        this._sel = this._page * this._per;
        this._buildPage();
        this._onPreview(this._files[this._sel]);
    }

    navigateRandom(files) {
        let next;
        do { next = Math.floor(Math.random() * files.length); } while (next === this._sel && files.length > 1);
        this._sel  = next;
        this._page = Math.floor(next / this._per);
        this._buildPage();
        this._onPreview(files[next]);
    }

    jumpTo(path) {
        const i = this._files.indexOf(path);
        if (i === -1) return;
        this._sel  = i;
        this._page = Math.floor(i / this._per);
        this._buildPage();
    }

    wasConfirmed() { return this._confirmed; }

    destroy() {
        if (this._idleId !== null) { GLib.source_remove(this._idleId); this._idleId = null; }
        this._cache.clear();
    }
}

// ─── CarouselView ─────────────────────────────────────────────────────────────

class CarouselView {
    constructor(files, currentPath, onPreview, onConfirm, onRename) {
        this._files     = files;
        this._idx       = Math.max(0, files.indexOf(currentPath));
        this._onPreview = onPreview;
        this._onConfirm = onConfirm;
        this._onRename  = onRename;
        this._confirmed = false;

        this.actor = new St.Widget({
            style:     `width:${CONTENT_W}px;height:${CONTENT_H}px;`,
            reactive:  true,
            can_focus: true,
        });

        // Large thumbnail
        this._thumb = new St.Button({
            style:              `width:${CAR_W}px;height:${CAR_H}px;border-radius:8px;border:2px solid rgba(255,255,255,0.5);background-color:rgba(128,128,128,0.2);`,
            clip_to_allocation: true,
        });
        this._thumb.set_position(0, 0);
        this._thumb.connect('clicked', () => {
            this._confirmed = true;
            this._onConfirm(this._files[this._idx]);
        });
        this.actor.add_child(this._thumb);

        // Counter
        this._counter = new St.Label({
            text:  '',
            style: 'font-size:10px;color:rgba(255,255,255,0.35);',
        });
        this._counter.set_position(CAR_W - 50, CAR_H - 18);
        this.actor.add_child(this._counter);

        // Filename label button
        this._labelBtn = new St.Button({
            style: `width:${CAR_W}px;height:${CAR_LABEL_H}px;`,
        });
        this._labelBtn.set_child(new St.Label({
            text:  '',
            style: `font-size:12px;color:rgba(255,255,255,0.7);text-align:center;width:${CAR_W}px;`,
        }));
        this._labelBtn.set_position(0, CAR_H + 4);
        this._labelBtn.connect('clicked', () => {
            startRename(this.actor, this._labelBtn, baseName(this._files[this._idx]),
                0, CAR_H + 4, CAR_W, CAR_LABEL_H,
                (newName) => {
                    const newPath = renameFile(this._files[this._idx], newName);
                    if (newPath) {
                        this._files[this._idx] = newPath;
                        this._labelBtn.get_child().set_text(newName);
                        this._onRename(this._idx, newPath);
                    }
                }
            );
        });
        this.actor.add_child(this._labelBtn);

        // Nav hint is shown in the BottomBar for carousel mode

        this._update();

        // Keys
        this.actor.connect('key-press-event', (_a, ev) => {
            const sym = ev.get_key_symbol();
            if (sym === Clutter.KEY_Left  || sym === Clutter.KEY_h) { this.navigate(-1); return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Right || sym === Clutter.KEY_j) { this.navigate(+1); return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) {
                this._confirmed = true;
                this._onConfirm(this._files[this._idx]);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.actor.connect('scroll-event', (_a, ev) => {
            const dir = ev.get_scroll_direction();
            if (dir === Clutter.ScrollDirection.UP   || dir === Clutter.ScrollDirection.LEFT)  this.navigate(-1);
            if (dir === Clutter.ScrollDirection.DOWN || dir === Clutter.ScrollDirection.RIGHT) this.navigate(+1);
            return Clutter.EVENT_STOP;
        });
    }

    _update() {
        const path = this._files[this._idx];
        if (!path) return;
        this._thumb.style = `${thumbStyle(CAR_W, CAR_H, path)}border:2px solid rgba(255,255,255,0.5);border-radius:8px;`;
        this._labelBtn.get_child().set_text(baseName(path));
        this._counter.set_text(`${this._idx + 1} / ${this._files.length}`);
    }

    navigate(delta) {
        const n    = this._files.length;
        const next = ((this._idx + delta) % n + n) % n;
        if (next === this._idx) return;
        this._idx  = next;
        this._update();
        this._onPreview(this._files[next]);
    }

    navigateRandom(files) {
        let next;
        do { next = Math.floor(Math.random() * files.length); } while (next === this._idx && files.length > 1);
        this._idx = next;
        this._update();
        this._onPreview(files[next]);
    }

    jumpTo(path) {
        const i = this._files.indexOf(path);
        if (i === -1 || i === this._idx) return;
        this._idx = i;
        this._update();
    }

    wasConfirmed() { return this._confirmed; }
    destroy() {}
}

// ─── WallpaperSwitcherIndicator ───────────────────────────────────────────────

const WallpaperSwitcherIndicator = GObject.registerClass(
class WallpaperSwitcherIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Wallpaper Switcher', false);

        this._ext         = extension;
        this._settings    = extension.getSettings(SCHEMA_ID);
        this._bgSettings  = new Gio.Settings({ schema_id: BG_SCHEMA });
        this._view        = null;
        this._bar         = null;
        this._prevPath    = null;
        this._monitor     = null;
        this._rotateTimer = null;
        this._scaling     = 'zoom';

        this.add_child(new St.Icon({
            icon_name:   'preferences-desktop-wallpaper-symbolic',
            style_class: 'system-status-icon',
        }));

        // Let the theme provide outer padding; we size content to fit inside it
        // Let GNOME size the popup naturally based on content

        this._popupBox = new St.BoxLayout({
            vertical: true,
            style:    `width:${CONTENT_W}px; padding:${POPUP_PAD}px;`,
        });
        this.menu.box.add_child(this._popupBox);

        this._emptyLabel = new St.Label({
            text:  'No folder set — right-click for Settings',
            style: 'padding:12px 16px;color:rgba(255,255,255,0.5);',
        });

        // Right-click → settings
        this.connect('button-press-event', (_a, ev) => {
            if (ev.get_button() === Clutter.BUTTON_SECONDARY) {
                this.menu.close();
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => { extension.openPreferences(); return GLib.SOURCE_REMOVE; });
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.menu.connect('open-state-changed', (_m, open) => {
            if (open) this._onOpen();
            else      this._onClose();
        });

        this._watchFolder();
        this._startRotateTimer();

        this._settings.connect('changed::wallpaper-folder',   () => { this._watchFolder(); this._restartRotateTimer(); });
        this._settings.connect('changed::include-subfolders', () => { this._watchFolder(); this._restartRotateTimer(); });
        this._settings.connect('changed::auto-rotate',        () => this._restartRotateTimer());
        this._settings.connect('changed::rotate-interval',    () => this._restartRotateTimer());
    }

    _currentWallpaper() {
        const uri = this._bgSettings.get_string('picture-uri');
        try { return GLib.filename_from_uri(uri)[0]; } catch (_) { return null; }
    }

    forcePopupWidth() {
        // Set width on the menu actor itself — most reliable approach
        this.menu.actor.style = `width:${POPUP_W}px;`;
    }

    _getFiles() {
        return listImages(
            this._settings.get_string('wallpaper-folder'),
            this._settings.get_boolean('include-subfolders')
        );
    }

    _onOpen() {
        this._scaling  = this._settings.get_string('picture-options');
        this._prevPath = this._currentWallpaper();
        this._destroyContents();
        this._popupBox.remove_all_children();

        const files = this._getFiles();
        if (files.length === 0) { this._popupBox.add_child(this._emptyLabel); return; }
        this._build(files);
    }

    _build(files) {
        const mode      = this._settings.get_string('view-mode') ?? 'grid';
        const onPreview = (p) => setWallpaper(p, this._scaling);
        const onConfirm = (p) => { setWallpaper(p, this._scaling); this.menu.close(); };
        const onRename  = () => {};

        this._view = mode === 'grid'
            ? new GridView(files, this._prevPath, onPreview, onConfirm, onRename)
            : new CarouselView(files, this._prevPath, onPreview, onConfirm, onRename);

        this._bar = new BottomBar(
            this._settings,
            mode,
            () => this._view?.navigateRandom(files),
            () => { this.menu.close(); GLib.idle_add(GLib.PRIORITY_DEFAULT, () => { this._ext.openPreferences(); return GLib.SOURCE_REMOVE; }); },
            () => {
                const next = (this._settings.get_string('view-mode') ?? 'grid') === 'grid' ? 'carousel' : 'grid';
                this._settings.set_string('view-mode', next);
                const cur = this._currentWallpaper();
                this._destroyContents();
                this._popupBox.remove_all_children();
                this._build(this._getFiles());
            }
        );

        this._bar.setSkipCallback(() => {
            const next = randomOther(this._getFiles(), this._currentWallpaper());
            if (next) { setWallpaper(next, this._scaling); this._view?.jumpTo(next); this._restartRotateTimer(); }
        });

        this._popupBox.add_child(this._view.actor);
        this._popupBox.add_child(this._bar.actor);

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._view?.actor.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });

        this._escId = this._view.actor.connect('key-press-event', (_a, ev) => {
            if (ev.get_key_symbol() === Clutter.KEY_Escape) {
                this._view._confirmed = true;
                if (this._prevPath) setWallpaper(this._prevPath, this._scaling);
                this.menu.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _onClose() {
        if (this._view && this._prevPath && !this._view.wasConfirmed())
            setWallpaper(this._prevPath, this._scaling);
        this._destroyContents();
    }

    _destroyContents() {
        this._view?.destroy(); this._view = null;
        this._bar?.destroy();  this._bar  = null;
        this._escId = null;
    }

    _applyRandomHotkey() {
        const files = this._getFiles();
        if (!files.length) return;
        const next = randomOther(files, this._currentWallpaper());
        if (!next) return;
        setWallpaper(next, this._settings.get_string('picture-options'));
        if (this._view && this.menu.isOpen) this._view.jumpTo(next);
    }

    _startRotateTimer() {
        if (!this._settings.get_boolean('auto-rotate')) return;
        const secs = this._settings.get_int('rotate-interval') * 60;
        this._rotateTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, secs, () => {
            this._rotateTick(); return GLib.SOURCE_CONTINUE;
        });
    }

    _restartRotateTimer() {
        if (this._rotateTimer !== null) { GLib.source_remove(this._rotateTimer); this._rotateTimer = null; }
        this._startRotateTimer();
    }

    _rotateTick() {
        const files = this._getFiles();
        if (!files.length) return;
        const next = randomOther(files, this._currentWallpaper());
        if (!next) return;
        setWallpaper(next, this._settings.get_string('picture-options'));
        if (this._view && this.menu.isOpen) this._view.jumpTo(next);
    }

    _watchFolder() {
        if (this._monitor) { this._monitor.cancel(); this._monitor = null; }
        const folder = this._settings.get_string('wallpaper-folder');
        if (!folder) return;
        try {
            const dir = Gio.File.new_for_path(folder);
            this._monitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', () => {
                if (this.menu.isOpen) {
                    this.menu.close();
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => { this.menu.open(); return GLib.SOURCE_REMOVE; });
                }
            });
        } catch (_) {}
    }

    destroy() {
        if (this._rotateTimer !== null) { GLib.source_remove(this._rotateTimer); this._rotateTimer = null; }
        if (this._monitor) { this._monitor.cancel(); this._monitor = null; }
        this._destroyContents();
        super.destroy();
    }
});

// ─── Extension entry point ────────────────────────────────────────────────────

export default class WallpaperSwitcherExtension extends Extension {
    enable() {
        this._settings  = this.getSettings(SCHEMA_ID);
        this._indicator = new WallpaperSwitcherIndicator(this);
        Main.panel.addToStatusArea('wallpaper-switcher', this._indicator, 0,
            this._settings.get_string('panel-position'));
        this._posChangedId = this._settings.connect('changed::panel-position', () => this._reposition());
        Main.wm.addKeybinding(
            'random-hotkey', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._indicator?._applyRandomHotkey()
        );
    }

    _reposition() {
        const boxes = { left: Main.panel._leftBox, center: Main.panel._centerBox, right: Main.panel._rightBox };
        for (const box of Object.values(boxes)) { try { box.remove_child(this._indicator); } catch (_) {} }
        delete Main.panel.statusArea['wallpaper-switcher'];
        Main.panel.addToStatusArea('wallpaper-switcher', this._indicator, 0,
            this._settings.get_string('panel-position'));
    }

    disable() {
        Main.wm.removeKeybinding('random-hotkey');
        if (this._posChangedId) { this._settings?.disconnect(this._posChangedId); this._posChangedId = null; }
        this._indicator?.destroy();
        this._indicator = null;
        this._settings  = null;
    }
}
