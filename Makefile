UUID       = wallpaper-switcher@local
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: install uninstall compile-schemas

install: compile-schemas
	mkdir -p "$(INSTALL_DIR)"
	cp -r metadata.json extension.js prefs.js schemas README.md "$(INSTALL_DIR)/"
	@echo ""
	@echo "✓  Installed to $(INSTALL_DIR)"
	@echo "   Run:  gnome-extensions enable $(UUID)"
	@echo "   Then: log out and back in (Wayland) or Alt+F2 → r (X11)"

uninstall:
	rm -rf "$(INSTALL_DIR)"
	@echo "✓  Removed $(INSTALL_DIR)"

compile-schemas:
	glib-compile-schemas schemas/
	@echo "✓  Schema compiled"
