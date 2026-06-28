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

const CARD_W     = 180;
const CARD_H     = 112;
const SIDE_SCALE = 0.75;
const SIDE_W     = Math.round(CARD_W * SIDE_SCALE);
const SIDE_H     = Math.round(CARD_H * SIDE_SCALE);
const GAP        = 10;
const PEEK       = 1;
const POPUP_PAD  = 16;
const POPUP_W    = POPUP_PAD * 2 + CARD_W + PEEK * 2 * (SIDE_W + GAP);

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

function makeThumbStyle(w, h, path) {
    const escaped = path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `
        width: ${w}px; height: ${h}px; border-radius: 7px;
        background-image: url('${escaped}');
        background-size: cover; background-position: center;
    `;
}

function randomOther(files, currentPath) {
    if (files.length <= 1) return files[0] ?? null;
    let pick;
    do { pick = files[Math.floor(Math.random() * files.length)]; }
    while (pick === currentPath);
    return pick;
}

function intervalLabel(mins) {
    return mins === 60 ? '1 hr' : `${mins} min`;
}

// ─── CardCarousel ─────────────────────────────────────────────────────────────

class CardCarousel {
    constructor(files, currentPath, settings, onPreview, onConfirm, onSkip) {
        this._files     = files;
        this._index     = Math.max(0, files.indexOf(currentPath));
        this._settings  = settings;
        this._onPreview = onPreview;
        this._onConfirm = onConfirm;
        this._onSkip    = onSkip;
        this._idleId    = null;
        this._cards     = new Map();
        this._confirmed = false;

        // Total height: cards + button row + hint
        this.actor = new St.Widget({
            style:     `width: ${POPUP_W}px; height: ${CARD_H + 86}px;`,
            reactive:  true,
            can_focus: true,
        });

        // ── card strip ────────────────────────────────────────────────────────
        this._strip = new St.Widget({ style: `height: ${CARD_H + 16}px;` });
        this._strip.set_clip(0, 0, POPUP_W, CARD_H + 16);
        this.actor.add_child(this._strip);

        // ── button row ────────────────────────────────────────────────────────
        this._btnRow = new St.BoxLayout({
            vertical: false,
            style:    `width: ${POPUP_W - POPUP_PAD * 2}px; padding: 6px ${POPUP_PAD}px 0;`,
        });
        this._btnRow.set_position(0, CARD_H + 14);
        this.actor.add_child(this._btnRow);

        // Left side — Skip + interval (conditional)
        this._leftBox = new St.BoxLayout({ vertical: false, style: 'spacing: 6px;', x_expand: true });
        this._btnRow.add_child(this._leftBox);

        // Right side — Settings + shuffle toggle
        const rightBox = new St.BoxLayout({ vertical: false, style: 'spacing: 4px;' });
        this._btnRow.add_child(rightBox);

        // Settings icon button
        const settingsBtn = new St.Button({
            child: new St.Icon({ icon_name: 'emblem-system-symbolic', icon_size: 16 }),
            style: 'padding: 4px 6px; border-radius: 6px; background-color: rgba(255,255,255,0.08);',
        });
        settingsBtn.connect('clicked', () => {
            // Close carousel and open prefs — indicator handles openPreferences
            this._onOpenSettings?.();
        });
        rightBox.add_child(settingsBtn);

        // Shuffle toggle icon button
        this._shuffleBtn = new St.Button({
            child: new St.Icon({ icon_name: 'media-playlist-shuffle-symbolic', icon_size: 16 }),
            style: '',
        });
        this._shuffleBtn.connect('clicked', () => {
            const current = this._settings.get_boolean('auto-rotate');
            this._settings.set_boolean('auto-rotate', !current);
            this._syncAutoRotateUI();
        });
        rightBox.add_child(this._shuffleBtn);

        // ── hint text ─────────────────────────────────────────────────────────
        const hint = new St.Label({
            text:  'scroll or ← →  •  R random  •  click to apply  •  Esc revert  •  ⌨ Super+Alt+W anytime',
            style: `font-size: 10px; color: rgba(255,255,255,0.28); padding: 4px ${POPUP_PAD}px 0;`,
        });
        hint.set_position(0, CARD_H + 56);
        this.actor.add_child(hint);

        // Build initial state
        this._buildVisibleCards();
        this._syncAutoRotateUI();

        // ── keyboard ─────────────────────────────────────────────────────────
        this.actor.connect('key-press-event', (_a, event) => {
            const sym = event.get_key_symbol();
            if (sym === Clutter.KEY_Left  || sym === Clutter.KEY_h) { this.navigate(-1); return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Right || sym === Clutter.KEY_j) { this.navigate(+1); return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_r     || sym === Clutter.KEY_R) { this.navigateRandom(); return Clutter.EVENT_STOP; }
            if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) {
                this._confirmed = true;
                this._onConfirm(this._files[this._index]);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // ── scroll wheel ──────────────────────────────────────────────────────
        this.actor.connect('scroll-event', (_a, event) => {
            const dir = event.get_scroll_direction();
            if (dir === Clutter.ScrollDirection.UP   || dir === Clutter.ScrollDirection.LEFT)  this.navigate(-1);
            if (dir === Clutter.ScrollDirection.DOWN || dir === Clutter.ScrollDirection.RIGHT) this.navigate(+1);
            return Clutter.EVENT_STOP;
        });

        // Watch settings changes while carousel is open
        this._settingsId = this._settings.connect('changed::auto-rotate', () => this._syncAutoRotateUI());
        this._intervalId = this._settings.connect('changed::rotate-interval', () => this._syncIntervalCombo());
    }

    // ── auto-rotate UI sync ───────────────────────────────────────────────────

    _syncAutoRotateUI() {
        const on = this._settings.get_boolean('auto-rotate');

        // Shuffle button — bright accent when on, dim when off
        this._shuffleBtn.style = on
            ? 'padding: 4px 6px; border-radius: 6px; background-color: rgba(255,255,255,0.18); color: #78d4f0;'
            : 'padding: 4px 6px; border-radius: 6px; background-color: rgba(255,255,255,0.06); opacity: 0.45;';

        // Rebuild left box contents
        this._leftBox.remove_all_children();

        if (on) {
            // Skip button
            const skipBtn = new St.Button({
                label: 'Skip',
                style: 'padding: 4px 14px; border-radius: 6px; background-color: rgba(255,255,255,0.12); font-size: 12px;',
            });
            skipBtn.connect('clicked', () => this._onSkip());
            this._leftBox.add_child(skipBtn);

            // Interval dropdown — built as a cycling button for simplicity in St
            this._buildIntervalButton();
        }
    }

    _buildIntervalButton() {
        const cur  = this._settings.get_int('rotate-interval');
        const idx  = Math.max(0, INTERVAL_MINS.indexOf(cur));
        const label = intervalLabel(INTERVAL_MINS[idx]);

        this._intervalBtn = new St.Button({
            label: `⏱ ${label}`,
            style: 'padding: 4px 10px; border-radius: 6px; background-color: rgba(255,255,255,0.08); font-size: 11px;',
        });
        this._intervalBtn.connect('clicked', () => {
            const curMins  = this._settings.get_int('rotate-interval');
            const curIdx   = Math.max(0, INTERVAL_MINS.indexOf(curMins));
            const nextMins = INTERVAL_MINS[(curIdx + 1) % INTERVAL_MINS.length];
            this._settings.set_int('rotate-interval', nextMins); // persists + fires changed signal
        });
        this._leftBox.add_child(this._intervalBtn);
    }

    _syncIntervalCombo() {
        if (!this._intervalBtn) return;
        const cur = this._settings.get_int('rotate-interval');
        this._intervalBtn.set_label(`⏱ ${intervalLabel(cur)}`);
    }

    // ── card window ───────────────────────────────────────────────────────────

    _windowIndices() {
        const n = this._files.length;
        const indices = [];
        for (let d = -(PEEK + 1); d <= (PEEK + 1); d++)
            indices.push(((this._index + d) % n + n) % n);
        return indices;
    }

    _buildVisibleCards() {
        const visible = new Set(this._windowIndices());
        for (const i of visible) { if (!this._cards.has(i)) this._makeCard(i); }
        for (const [i, card] of this._cards) {
            if (!visible.has(i)) { card.destroy(); this._cards.delete(i); }
        }
        this._layoutCards(false);
        this._queueThumbnails([...visible]);
    }

    _makeCard(i) {
        const card = new St.Button({
            style: `
                width: ${CARD_W}px; height: ${CARD_H}px;
                border-radius: 8px; border: 2px solid transparent;
                background-color: rgba(128,128,128,0.15);
            `,
            can_focus: false, clip_to_allocation: true,
        });
        card._thumbLoaded = false;
        card.connect('clicked', () => {
            if (i === this._index) {
                this._confirmed = true;
                this._onConfirm(this._files[i]);
            } else {
                this._index = i;
                this._buildVisibleCards();
                this._onPreview(this._files[i]);
            }
        });
        this._strip.add_child(card);
        this._cards.set(i, card);
        return card;
    }

    _offsetOf(i) {
        const n = this._files.length;
        let offset = i - this._index;
        if (offset >  n / 2) offset -= n;
        if (offset < -n / 2) offset += n;
        return offset;
    }

    _layoutCards(animate) {
        const vcx = (POPUP_W - POPUP_PAD * 2) / 2;
        for (const [i, card] of this._cards) {
            const offset  = this._offsetOf(i);
            const isFocus = offset === 0;
            const targetW = isFocus ? CARD_W : SIDE_W;
            const targetH = isFocus ? CARD_H : SIDE_H;
            const alpha   = Math.max(0, 1 - Math.abs(offset) * 0.4);
            const x       = POPUP_PAD + vcx - CARD_W / 2 + offset * (SIDE_W + GAP);
            const y       = (CARD_H - targetH) / 2;
            const border  = isFocus ? '2px solid rgba(255,255,255,0.6)' : '2px solid transparent';

            card.style = card._thumbLoaded
                ? `${makeThumbStyle(targetW, targetH, this._files[i])} border: ${border}; opacity: ${alpha};`
                : `width: ${targetW}px; height: ${targetH}px; border-radius: 8px; border: ${border}; opacity: ${alpha}; background-color: rgba(128,128,128,0.15);`;

            if (animate) card.ease({ x, y, duration: 180, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            else         card.set_position(x, y);
        }
    }

    _queueThumbnails(indices) {
        if (this._idleId !== null) { GLib.source_remove(this._idleId); this._idleId = null; }
        const queue   = [...indices].sort((a, b) => Math.abs(this._offsetOf(a)) - Math.abs(this._offsetOf(b)));
        const pending = queue.filter(i => this._cards.has(i) && !this._cards.get(i)._thumbLoaded);
        if (pending.length === 0) return;
        const processNext = () => {
            this._idleId = null;
            const i = pending.shift();
            if (i !== undefined) {
                this._applyThumb(i);
                if (pending.length > 0) this._idleId = GLib.idle_add(GLib.PRIORITY_LOW, processNext);
            }
            return GLib.SOURCE_REMOVE;
        };
        this._idleId = GLib.idle_add(GLib.PRIORITY_LOW, processNext);
    }

    _applyThumb(i) {
        const card = this._cards.get(i);
        if (!card || card._thumbLoaded) return;
        const offset  = this._offsetOf(i);
        const isFocus = offset === 0;
        const targetW = isFocus ? CARD_W : SIDE_W;
        const targetH = isFocus ? CARD_H : SIDE_H;
        const alpha   = Math.max(0, 1 - Math.abs(offset) * 0.4);
        const border  = isFocus ? '2px solid rgba(255,255,255,0.6)' : '2px solid transparent';
        card.style = `${makeThumbStyle(targetW, targetH, this._files[i])} border: ${border}; opacity: ${alpha};`;
        card._thumbLoaded = true;
    }

    // ── public ────────────────────────────────────────────────────────────────

    navigate(delta) {
        const n    = this._files.length;
        const next = ((this._index + delta) % n + n) % n;
        if (next === this._index) return;
        this._index = next;
        this._buildVisibleCards();
        this._onPreview(this._files[next]);
    }

    navigateRandom() {
        if (this._files.length <= 1) return;
        const n = this._files.length;
        let next;
        do { next = Math.floor(Math.random() * n); } while (next === this._index);
        this._index = next;
        this._buildVisibleCards();
        this._onPreview(this._files[next]);
    }

    jumpTo(path) {
        const i = this._files.indexOf(path);
        if (i === -1 || i === this._index) return;
        this._index = i;
        this._buildVisibleCards();
    }

    setOpenSettingsCallback(cb) { this._onOpenSettings = cb; }

    wasConfirmed() { return this._confirmed; }

    destroy() {
        if (this._idleId    !== null) { GLib.source_remove(this._idleId); this._idleId = null; }
        if (this._settingsId !== null) { this._settings.disconnect(this._settingsId); this._settingsId = null; }
        if (this._intervalId !== null) { this._settings.disconnect(this._intervalId); this._intervalId = null; }
        this._cards.clear();
    }
}

// ─── WallpaperSwitcherIndicator ───────────────────────────────────────────────

const WallpaperSwitcherIndicator = GObject.registerClass(
class WallpaperSwitcherIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Wallpaper Switcher', false);

        this._ext         = extension;
        this._settings    = extension.getSettings(SCHEMA_ID);
        this._bgSettings  = new Gio.Settings({ schema_id: BG_SCHEMA });
        this._carousel    = null;
        this._prevPath    = null;
        this._monitor     = null;
        this._rotateTimer = null;
        this._scaling     = 'zoom';

        this.add_child(new St.Icon({
            icon_name:   'preferences-desktop-wallpaper-symbolic',
            style_class: 'system-status-icon',
        }));

        this._popupBox = new St.BoxLayout({ vertical: true, style: 'padding: 8px 0;' });
        this.menu.box.add_child(this._popupBox);

        this._emptyLabel = new St.Label({
            text:  'No folder set — right-click for Settings',
            style: 'padding: 12px 16px; color: rgba(255,255,255,0.5);',
        });

        // Right-click → settings
        this.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === Clutter.BUTTON_SECONDARY) {
                this.menu.close();
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    extension.openPreferences();
                    return GLib.SOURCE_REMOVE;
                });
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

    _getFiles() {
        return listImages(
            this._settings.get_string('wallpaper-folder'),
            this._settings.get_boolean('include-subfolders')
        );
    }

    // ── open / close ──────────────────────────────────────────────────────────

    _onOpen() {
        this._scaling  = this._settings.get_string('picture-options');
        this._prevPath = this._currentWallpaper();

        if (this._carousel) { this._carousel.destroy(); this._carousel = null; }
        this._popupBox.remove_all_children();

        const files = this._getFiles();
        if (files.length === 0) {
            this._popupBox.add_child(this._emptyLabel);
            return;
        }

        this._carousel = new CardCarousel(
            files,
            this._prevPath,
            this._settings,
            (path) => setWallpaper(path, this._scaling),
            (path) => { setWallpaper(path, this._scaling); this.menu.close(); },
            () => {
                const next = randomOther(this._getFiles(), this._currentWallpaper());
                if (next) {
                    setWallpaper(next, this._scaling);
                    this._carousel?.jumpTo(next);
                    this._restartRotateTimer();
                }
            }
        );

        this._carousel.setOpenSettingsCallback(() => {
            this.menu.close();
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._ext.openPreferences();
                return GLib.SOURCE_REMOVE;
            });
        });

        this._popupBox.add_child(this._carousel.actor);

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._carousel?.actor.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });

        // Escape — revert and close
        this._escId = this._carousel.actor.connect('key-press-event', (_a, ev) => {
            if (ev.get_key_symbol() === Clutter.KEY_Escape) {
                this._carousel._confirmed = true;
                if (this._prevPath) setWallpaper(this._prevPath, this._scaling);
                this.menu.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _onClose() {
        if (this._carousel) {
            if (this._prevPath && !this._carousel.wasConfirmed())
                setWallpaper(this._prevPath, this._scaling);
            this._carousel.destroy();
            this._carousel = null;
            this._escId    = null;
        }
    }

    // ── auto-rotate timer ─────────────────────────────────────────────────────

    _startRotateTimer() {
        if (!this._settings.get_boolean('auto-rotate')) return;
        const secs = this._settings.get_int('rotate-interval') * 60;
        this._rotateTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, secs, () => {
            this._rotateTick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _restartRotateTimer() {
        if (this._rotateTimer !== null) { GLib.source_remove(this._rotateTimer); this._rotateTimer = null; }
        this._startRotateTimer();
    }

    _rotateTick() {
        const files = this._getFiles();
        if (files.length === 0) return;
        const next = randomOther(files, this._currentWallpaper());
        if (!next) return;
        setWallpaper(next, this._settings.get_string('picture-options'));
        if (this._carousel && this.menu.isOpen)
            this._carousel.jumpTo(next);
    }

    // ── random hotkey handler ─────────────────────────────────────────────────

    _applyRandomHotkey() {
        const files = this._getFiles();
        if (files.length === 0) return;
        const scaling = this._settings.get_string('picture-options');
        const next    = randomOther(files, this._currentWallpaper());
        if (!next) return;
        setWallpaper(next, scaling);
        // If carousel is open, jump it to the new wallpaper too
        if (this._carousel && this.menu.isOpen)
            this._carousel.jumpTo(next);
    }

    // ── file monitor ──────────────────────────────────────────────────────────

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
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                        this.menu.open();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
        } catch (_) {}
    }

    destroy() {
        if (this._rotateTimer !== null) { GLib.source_remove(this._rotateTimer); this._rotateTimer = null; }
        if (this._monitor)              { this._monitor.cancel(); this._monitor = null; }
        if (this._carousel)             { this._carousel.destroy(); this._carousel = null; }
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
        this._bindHotkey();
    }

    _bindHotkey() {
        Main.wm.addKeybinding(
            'random-hotkey',
            this._settings,
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
