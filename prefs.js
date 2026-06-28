import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SCHEMA_ID = 'org.gnome.shell.extensions.wallpaper-switcher';

export default class WallpaperSwitcherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings(SCHEMA_ID);

        window.set_title('Wallpaper Switcher');
        window.set_default_size(540, 460);

        const page = new Adw.PreferencesPage();

        // ── Folder ────────────────────────────────────────────────────────────
        const folderGroup = new Adw.PreferencesGroup({
            title:       'Wallpaper folder',
            description: 'Images in this folder will appear in the panel carousel (jpg, png, webp, …)',
        });
        page.add(folderGroup);

        const folderRow = new Adw.ActionRow({
            title:    'Folder',
            subtitle: settings.get_string('wallpaper-folder') || 'Not set',
        });
        const chooseBtn = new Gtk.Button({ label: 'Choose…', valign: Gtk.Align.CENTER, css_classes: ['suggested-action'] });
        const clearBtn  = new Gtk.Button({ label: 'Clear',   valign: Gtk.Align.CENTER, css_classes: ['destructive-action'] });

        chooseBtn.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({
                title:          'Select wallpaper folder',
                initial_folder: Gio.File.new_for_path(
                    settings.get_string('wallpaper-folder') || GLib.get_home_dir()
                ),
                modal: true,
            });
            dialog.select_folder(window, null, (_d, res) => {
                try {
                    const file = dialog.select_folder_finish(res);
                    if (file) settings.set_string('wallpaper-folder', file.get_path());
                } catch (_) {}
            });
        });
        clearBtn.connect('clicked', () => settings.set_string('wallpaper-folder', ''));
        settings.connect('changed::wallpaper-folder', () => {
            folderRow.set_subtitle(settings.get_string('wallpaper-folder') || 'Not set');
        });
        folderRow.add_suffix(clearBtn);
        folderRow.add_suffix(chooseBtn);
        folderGroup.add(folderRow);

        const subfolderRow = new Adw.SwitchRow({
            title:    'Include subfolders',
            subtitle: 'Scan subfolders recursively for images',
        });
        settings.bind('include-subfolders', subfolderRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        folderGroup.add(subfolderRow);

        // ── Appearance ────────────────────────────────────────────────────────
        const appearGroup = new Adw.PreferencesGroup({ title: 'Appearance' });
        page.add(appearGroup);

        const positionRow   = new Adw.ActionRow({ title: 'Panel position', subtitle: 'Which section of the top bar to place the icon in' });
        const positionCombo = new Gtk.DropDown({ valign: Gtk.Align.CENTER });
        const posKeys       = ['left', 'center', 'right'];
        positionCombo.set_model(Gtk.StringList.new(['Left', 'Center', 'Right']));
        positionCombo.set_selected(Math.max(0, posKeys.indexOf(settings.get_string('panel-position'))));
        positionCombo.connect('notify::selected', () => settings.set_string('panel-position', posKeys[positionCombo.get_selected()]));
        settings.connect('changed::panel-position', () => positionCombo.set_selected(Math.max(0, posKeys.indexOf(settings.get_string('panel-position')))));
        positionRow.add_suffix(positionCombo);
        appearGroup.add(positionRow);

        const scalingRow    = new Adw.ActionRow({ title: 'Wallpaper scaling', subtitle: 'How to fit the image to your screen' });
        const scalingLabels = ['Zoom (fill, crop edges)', 'Scaled (fit, letterbox)', 'Stretched', 'Centered', 'Tiled'];
        const scalingValues = ['zoom', 'scaled', 'stretched', 'centered', 'wallpaper'];
        const scalingCombo  = new Gtk.DropDown({ valign: Gtk.Align.CENTER });
        scalingCombo.set_model(Gtk.StringList.new(scalingLabels));
        const scaleIdx = scalingValues.indexOf(settings.get_string('picture-options'));
        scalingCombo.set_selected(scaleIdx >= 0 ? scaleIdx : 0);
        scalingCombo.connect('notify::selected', () => settings.set_string('picture-options', scalingValues[scalingCombo.get_selected()]));
        settings.connect('changed::picture-options', () => {
            const idx = scalingValues.indexOf(settings.get_string('picture-options'));
            scalingCombo.set_selected(idx >= 0 ? idx : 0);
        });
        scalingRow.add_suffix(scalingCombo);
        appearGroup.add(scalingRow);

        // ── Auto-rotate ───────────────────────────────────────────────────────
        const rotateGroup = new Adw.PreferencesGroup({
            title:       'Auto-rotate',
            description: 'Automatically change the wallpaper randomly on a timer',
        });
        page.add(rotateGroup);

        const rotateToggle = new Adw.SwitchRow({
            title:    'Enable auto-rotate',
            subtitle: 'Picks a random wallpaper at the chosen interval',
        });
        settings.bind('auto-rotate', rotateToggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        rotateGroup.add(rotateToggle);

        const intervalRow   = new Adw.ActionRow({ title: 'Interval', subtitle: 'How often to change the wallpaper' });
        const intervalCombo = new Gtk.DropDown({ valign: Gtk.Align.CENTER });
        const intervalMins  = [1, 5, 10, 15, 30, 60];
        intervalCombo.set_model(Gtk.StringList.new(intervalMins.map(m => m === 60 ? '60 min (1 hr)' : `${m} min`)));
        intervalCombo.set_selected(Math.max(0, intervalMins.indexOf(settings.get_int('rotate-interval'))));
        intervalCombo.connect('notify::selected', () => settings.set_int('rotate-interval', intervalMins[intervalCombo.get_selected()]));
        intervalRow.add_suffix(intervalCombo);
        intervalRow.sensitive = settings.get_boolean('auto-rotate');
        rotateGroup.add(intervalRow);

        settings.connect('changed::auto-rotate', () => {
            intervalRow.sensitive = settings.get_boolean('auto-rotate');
        });

        // ── Hotkey ────────────────────────────────────────────────────────────
        const hotkeyGroup = new Adw.PreferencesGroup({ title: 'Keyboard shortcut' });
        page.add(hotkeyGroup);

        const hotkeyRow = new Adw.ActionRow({
            title:    'Random wallpaper',
            subtitle: 'Apply a random wallpaper instantly without opening the carousel',
        });
        const hotkeyLabel = new Gtk.Label({
            label:       '<b>Super + Alt + W</b>',
            use_markup:  true,
            valign:      Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        hotkeyRow.add_suffix(hotkeyLabel);
        hotkeyGroup.add(hotkeyRow);

        window.add(page);
    }
}
