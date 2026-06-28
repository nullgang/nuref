#!/bin/bash
set -e

echo "╔══════════════════════════════════════════╗"
echo "║   NUREF - Package Builder                ║"
echo "╚══════════════════════════════════════════╝"

VERSION=$(node -p "require('./package.json').version")
echo "Version: ${VERSION}"
echo ""

# Build project
echo "▶ Building project..."
npm run build
echo ""

# Build DEB
echo "▶ Building .deb package..."
bash scripts/build-deb.sh
echo ""

# Build RPM
echo "▶ Building .rpm package..."
bash scripts/build-rpm.sh
echo ""

echo "╔══════════════════════════════════════════╗"
echo "║   Build complete!                        ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "DEB: dist/packaging/deb/nuref_${VERSION}_amd64.deb"
echo "RPM: ~/rpmbuild/RPMS/x86_64/nuref-${VERSION}-1.*.rpm"
echo ""
echo "Install DEB: sudo dpkg -i dist/packaging/deb/nuref_${VERSION}_amd64.deb"
echo "Install RPM: sudo rpm -i ~/rpmbuild/RPMS/x86_64/nuref-${VERSION}-1.*.rpm"
