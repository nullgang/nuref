#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
NAME="nuref"
ARCH="amd64"
DEB_NAME="${NAME}_${VERSION}_${ARCH}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building DEB package: ${DEB_NAME}.deb"

cd "$PROJECT_DIR"

# Build project
npm run build

# Create package structure
PKG_DIR="$(pwd)/dist/packaging/deb/${DEB_NAME}"
rm -rf "${PKG_DIR}"
mkdir -p "${PKG_DIR}/DEBIAN"
mkdir -p "${PKG_DIR}/usr/lib/nuref"
mkdir -p "${PKG_DIR}/usr/bin"
mkdir -p "${PKG_DIR}/usr/share/doc/nuref"

# Copy dist files (exclude packaging)
for f in dist/*; do
  basename=$(basename "$f")
  if [ "$basename" != "packaging" ]; then
    cp -r "$f" "${PKG_DIR}/usr/lib/nuref/"
  fi
done
cp package.json "${PKG_DIR}/usr/lib/nuref/"

# Copy production dependencies
npm install --omit=dev --prefix "${PKG_DIR}/usr/lib/nuref" 2>/dev/null || true

# Create wrapper scripts
cat > "${PKG_DIR}/usr/bin/nuref" << 'WRAPPER'
#!/bin/sh
exec node /usr/lib/nuref/cli/index.js "$@"
WRAPPER
chmod +x "${PKG_DIR}/usr/bin/nuref"

cat > "${PKG_DIR}/usr/bin/nuref-api" << 'WRAPPER'
#!/bin/sh
exec node /usr/lib/nuref/api/server.js "$@"
WRAPPER
chmod +x "${PKG_DIR}/usr/bin/nuref-api"

# Create control file
INSTALLED_SIZE=$(du -sk "${PKG_DIR}" | cut -f1)
cat > "${PKG_DIR}/DEBIAN/control" << EOF
Package: ${NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${INSTALLED_SIZE}
Maintainer: nullgang <noreply@github.com/nullgang>
Homepage: https://github.com/nullgang/nuref
Description: Universal Feed Processing Engine
 Fetch, parse, normalize, search, deduplicate, aggregate,
 compare, stream, and generate any feed format (RSS, Atom,
 JSON Feed, Sitemap). Includes CLI tools and REST API server.
Depends: nodejs (>= 18)
EOF

echo "/usr/lib/nuref/package.json" > "${PKG_DIR}/DEBIAN/conffiles"

# Create copyright
cat > "${PKG_DIR}/usr/share/doc/nuref/copyright" << 'EOF'
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: nuref
Upstream-Contact: https://github.com/nullgang/nuref
Source: https://github.com/nullgang/nuref

Files: *
Copyright: 2025 nuref contributors
License: MIT

License: MIT
 Permission is hereby granted, free of charge, to any person obtaining a
 copy of this software and associated documentation files (the "Software"),
 to deal in the Software without restriction, including without limitation
 the rights to use, copy, modify, merge, publish, distribute, sublicense,
 and/or sell copies of the Software, and to permit persons to whom the
 Software is furnished to do so, subject to the following conditions:
 .
 The above copyright notice and this permission notice shall be included
 in all copies or substantial portions of the Software.
 .
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR
 OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 OTHER DEALINGS IN THE SOFTWARE.
EOF

# Create changelog
cat > "${PKG_DIR}/usr/share/doc/nuref/changelog" << EOF
nuref (${VERSION}-1) stable; urgency=medium

  * Universal Feed Processing Engine
  * Fast regex parser (3-8x faster than XML parser)
  * Safety hardening and resilient fetcher
  * CLI and REST API server

 -- nullgang <noreply@github.com/nullgang>  $(date -R)
EOF
gzip -9 "${PKG_DIR}/usr/share/doc/nuref/changelog"

# Build .deb
DEB_DIR="$(pwd)/dist/packaging/deb"
cd "$DEB_DIR"

echo "2.0" > debian-binary
tar czf control.tar.gz -C "${PKG_DIR}/DEBIAN" .
tar czf data.tar.gz -C "${PKG_DIR}" usr
ar rcs "${DEB_NAME}.deb" debian-binary control.tar.gz data.tar.gz
rm -f debian-binary control.tar.gz data.tar.gz

echo "✅ Created: dist/packaging/deb/${DEB_NAME}.deb"
ls -lh "${DEB_NAME}.deb"
echo "   Install: sudo dpkg -i ${DEB_NAME}.deb"
