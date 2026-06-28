# Nuref Package Repository

## Quick Install

### Debian/Ubuntu (apt)

```bash
# Add repository
curl -sL https://raw.githubusercontent.com/nullgang/nuref/main/repo/install.sh | bash
```

Or manually:

```bash
# Add GPG key (optional, for verification)
curl -sSL https://raw.githubusercontent.com/nullgang/nuref/main/repo/apt/nuref.gpg | sudo gpg --dearmor -o /usr/share/keyrings/nuref.gpg

# Add repo
echo "deb [signed-by=/usr/share/keyrings/nuref.gpg] https://raw.githubusercontent.com/nullgang/nuref/main/repo/apt/debian ./" | sudo tee /etc/apt/sources.list.d/nuref.list

# Install
sudo apt update && sudo apt install nuref
```

### Fedora/RHEL (dnf)

```bash
# Add repo
sudo dnf config-manager --add-repo https://raw.githubusercontent.com/nullgang/nuref/main/repo/rpm/nuref.repo

# Install
sudo dnf install nuref
```

### Or use the installer

```bash
curl -sL https://raw.githubusercontent.com/nullgang/nuref/main/repo/install.sh | bash
```

## After Install

```bash
nuref --help          # CLI commands
nuref add <url>       # Add a feed
nuref list            # List feeds
nuref sync            # Sync all feeds
nuref search <query>  # Search items
nuref-api             # Start API server on port 3000
```

## Manual Install (without repo)

```bash
# Download .deb
wget https://raw.githubusercontent.com/nullgang/nuref/main/repo/apt/debian/nuref_1.0.0_amd64.deb

# Install
sudo dpkg -i nuref_1.0.0_amd64.deb
sudo apt-get install -f  # fix dependencies if needed
```

## Building from Source

```bash
git clone https://github.com/nullgang/nuref.git
cd nuref
npm install
npm run build
npm run pack:deb      # build .deb
npm run pack:rpm      # build .rpm (needs rpm-build)
npm run setup-repo    # setup local repo
```
