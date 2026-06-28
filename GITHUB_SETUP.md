# Putting Wallpaper Switcher on GitHub — Step by Step

This is a one-time setup. After this, publishing updates is just a few commands.

---

## Step 1 — Create a GitHub account

If you don't have one already, go to https://github.com and sign up. Free account is all you need.

---

## Step 2 — Install Git on Solus

```bash
sudo eopkg install git
```

Verify it worked:

```bash
git --version
```

---

## Step 3 — Tell Git who you are (one-time setup)

```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

Use the same email you signed up to GitHub with.

---

## Step 4 — Create a new repository on GitHub

1. Go to https://github.com/new
2. Fill in:
   - **Repository name:** `wallpaper-switcher` (or whatever you like)
   - **Description:** `A GNOME Shell extension for browsing and switching wallpapers from a panel carousel`
   - **Public** (so others can find and use it)
   - **Do NOT** tick "Add a README" — you already have one
3. Click **Create repository**
4. GitHub will show you a page with setup instructions — keep it open, you'll need the URL in Step 6

---

## Step 5 — Initialise the local repo

Navigate to your extension folder and set it up as a Git repository:

```bash
cd ~/.local/share/gnome-shell/extensions/wallpaper-switcher@local
git init
git add .
git commit -m "Initial release"
```

You should see a list of files being committed. That's your first snapshot.

---

## Step 6 — Connect to GitHub and push

Copy the repository URL from the GitHub page you left open in Step 4.
It will look like: `https://github.com/yourusername/wallpaper-switcher.git`

```bash
git remote add origin https://github.com/yourusername/wallpaper-switcher.git
git branch -M main
git push -u origin main
```

GitHub will ask for your username and password. For the password, use a **Personal Access Token** — GitHub no longer accepts your account password here. To create one:

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Give it a name like `wallpaper-switcher`
4. Tick **repo** under scopes
5. Click **Generate token**
6. Copy the token — paste it as your password when Git asks

Your code is now on GitHub!

---

## Step 7 — Create your first release

A release is a tagged version that GitHub packages up for download. This also triggers the automatic zip build.

```bash
git tag v1.0
git push origin v1.0
```

After about 30 seconds, go to your repository on GitHub and click **Releases** on the right side — you'll see a `v1.0` release with `wallpaper-switcher.zip` attached, ready for anyone to download.

---

## Updating the extension in future

Whenever you make changes and want to publish them:

```bash
cd ~/.local/share/gnome-shell/extensions/wallpaper-switcher@local

# Stage all changed files
git add .

# Commit with a description of what changed
git commit -m "Add subfolder toggle to carousel"

# Push to GitHub
git push

# Tag a new release (bump the version number each time)
git tag v1.1
git push origin v1.1
```

GitHub Actions will automatically build and attach the new zip to the release.

---

## What your GitHub repo page will show

- The README.md renders automatically as the project description
- The releases page lists every version with download links
- The code is browsable online — anyone can read it, report issues, or suggest changes

---

## Optional — store your token so Git doesn't ask every time

```bash
git config --global credential.helper store
```

The next time you push and enter your token, Git will remember it.
