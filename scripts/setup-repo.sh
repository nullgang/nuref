#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
NAME="nuref"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_DIR="${PROJECT_DIR}/repo"

echo "╔══════════════════════════════════════════╗"
echo "║  NUREF - Repository Setup                ║"
echo "╚══════════════════════════════════════════╝"
echo "Version: ${VERSION}"
echo ""

cd "$PROJECT_DIR"

# ═══════════════════════════════════════════
# APT Repository (Debian/Ubuntu)
# ═══════════════════════════════════════════
echo "▶ Setting up APT repository..."

# Build DEB
bash scripts/build-deb.sh

# Copy .deb to repo
mkdir -p "${REPO_DIR}/apt/debian"
cp dist/packaging/deb/${NAME}_${VERSION}_amd64.deb "${REPO_DIR}/apt/debian/"

# Generate Packages.gz
cd "${REPO_DIR}/apt/debian"
dpkg-scanpackages . /dev/null 2>/dev/null | gzip -9c > Packages.gz
cd "$PROJECT_DIR"

echo "✅ APT repo ready at: repo/apt/debian/"
echo ""

# ═══════════════════════════════════════════
# DNF/YUM Repository (Fedora/RHEL)
# ═══════════════════════════════════════════
echo "▶ Setting up DNF repository..."

# Build RPM if rpmbuild available
if command -v rpmbuild &> /dev/null; then
    bash scripts/build-rpm.sh
    
    # Copy RPMs to repo
    mkdir -p "${REPO_DIR}/rpm/x86_64"
    cp ~/rpmbuild/RPMS/x86_64/${NAME}-*.rpm "${REPO_DIR}/rpm/x86_64/" 2>/dev/null || true
    
    # Generate repodata
    if command -v createrepo_c &> /dev/null; then
        createrepo_c "${REPO_DIR}/rpm/x86_64/"
    elif command -v createrepo &> /dev/null; then
        createrepo "${REPO_DIR}/rpm/x86_64/"
    else
        echo "⚠️  createrepo_c not found. Install: sudo dnf install createrepo_c"
    fi
else
    echo "⚠️  rpmbuild not found, skipping RPM build"
    echo "   Install: sudo dnf install rpm-build createrepo_c"
fi

echo "✅ DNF repo ready at: repo/rpm/x86_64/"
echo ""

# ═══════════════════════════════════════════
# Generate install script
# ═══════════════════════════════════════════
cat > "${REPO_DIR}/install.sh" << 'INSTALLEOF'
#!/bin/bash
set -e

echo "Installing nuref..."

detect_os() {
    if [ -f /etc/debian_version ]; then
        echo "debian"
    elif [ -f /etc/fedora-release ] || [ -f /etc/redhat-release ]; then
        echo "rhel"
    else
        echo "unknown"
    fi
}

OS=$(detect_os)
REPO_BASE="https://raw.githubusercontent.com/nullgang/nuref/main/repo"

if [ "$OS" = "debian" ]; then
    echo "Detected Debian/Ubuntu"
    
    if ! command -v dpkg &> /dev/null; then
        echo "Error: dpkg not found. Are you on Debian/Ubuntu?"
        exit 1
    fi
    
    TMPDIR=$(mktemp -d)
    trap "rm -rf $TMPDIR" EXIT
    
    echo "Downloading package..."
    curl -sL "${REPO_BASE}/apt/debian/nuref_$(curl -sL ${REPO_BASE}/VERSION)_amd64.deb" -o "${TMPDIR}/nuref.deb"
    
    echo "Installing..."
    sudo dpkg -i "${TMPDIR}/nuref.deb"
    sudo apt-get install -f -y 2>/dev/null || true
    
    echo ""
    echo "✅ nuref installed!"
    
elif [ "$OS" = "rhel" ]; then
    echo "Detected Fedora/RHEL"
    
    if command -v dnf &> /dev/null; then
        PKG_MGR="dnf"
    elif command -v yum &> /dev/null; then
        PKG_MGR="yum"
    else
        echo "Error: Neither dnf nor yum found"
        exit 1
    fi
    
    TMPDIR=$(mktemp -d)
    trap "rm -rf $TMPDIR" EXIT
    
    echo "Downloading package..."
    curl -sL "${REPO_BASE}/rpm/x86_64/nuref-$(curl -sL ${REPO_BASE}/VERSION)-1.*.rpm" -o "${TMPDIR}/nuref.rpm"
    
    echo "Installing..."
    sudo ${PKG_MGR} install -y "${TMPDIR}/nuref.rpm"
    
    echo ""
    echo "✅ nuref installed!"
    
else
    echo "Unsupported OS. Please install manually:"
    echo "  npm install -g nuref"
    exit 1
fi

echo ""
echo "Usage:"
echo "  nuref --help          CLI commands"
echo "  nuref-api             Start API server"
echo ""
INSTALLEOF
chmod +x "${REPO_DIR}/install.sh"

# Write VERSION file
echo "${VERSION}" > "${REPO_DIR}/VERSION"

echo "╔══════════════════════════════════════════╗"
echo "║  Setup complete!                          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "To publish:"
echo "  1. Push repo/ to GitHub"
echo "  2. Enable GitHub Pages on main branch, /repo folder"
echo ""
echo "Users can then install with:"
echo "  curl -sL https://raw.githubusercontent.com/nullgang/nuref/main/repo/install.sh | bash"
echo ""
