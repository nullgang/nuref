#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
NAME="nuref"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building RPM package: ${NAME}-${VERSION}"

cd "$PROJECT_DIR"

# Build project
npm run build

# Create source tarball
TARBALL="${NAME}-${VERSION}.tar.gz"
tar czf "/tmp/${TARBALL}" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist/packaging' \
  -C . .

echo "Created source tarball: /tmp/${TARBALL}"

# Setup RPM build tree
RPM_DIR="${HOME}/rpmbuild"
mkdir -p "${RPM_DIR}"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

# Copy tarball
cp "/tmp/${TARBALL}" "${RPM_DIR}/SOURCES/"

# Copy spec file (update version)
sed "s/Version:        .*/Version:        ${VERSION}/" scripts/nuref.spec > "${RPM_DIR}/SPECS/nuref.spec"

# Build RPM
if command -v rpmbuild &> /dev/null; then
    rpmbuild -ba "${RPM_DIR}/SPECS/nuref.spec"
    echo ""
    echo "✅ RPM packages built:"
    ls -lh "${RPM_DIR}/RPMS/x86_64/"*.rpm 2>/dev/null || echo "  (check ${RPM_DIR}/RPMS/)"
    echo "   Install: sudo rpm -i ${RPM_DIR}/RPMS/x86_64/${NAME}-${VERSION}-1.*.rpm"
else
    echo ""
    echo "⚠️  rpmbuild not found. Options:"
    echo "   1. Install: sudo dnf install rpm-build"
    echo "   2. Then run: rpmbuild -ba ${RPM_DIR}/SPECS/nuref.spec"
    echo ""
    echo "   Source tarball ready at: /tmp/${TARBALL}"
    echo "   Spec file ready at: ${RPM_DIR}/SPECS/nuref.spec"
fi

rm -f "/tmp/${TARBALL}"
