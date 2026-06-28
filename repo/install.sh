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
