%global debug_package %{nil}

Name:           nuref
Version:        1.0.0
Release:        1%{?dist}
Summary:        Universal Feed Processing Engine

License:        MIT
URL:            https://github.com/nullgang/nuref
Source0:        %{name}-%{version}.tar.gz

BuildArch:      x86_64
BuildRequires:  nodejs >= 18
Requires:       nodejs >= 18

%description
Universal Feed Processing Engine - fetch, parse, normalize, search,
deduplicate, aggregate, compare, stream, and generate any feed format
(RSS, Atom, JSON Feed, Sitemap). Includes CLI tools and REST API server.

%prep
%setup -q

%build
npm install
npm run build

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/usr/lib/nuref
mkdir -p %{buildroot}/usr/bin

cp -r dist/* %{buildroot}/usr/lib/nuref/
cp package.json %{buildroot}/usr/lib/nuref/
npm install --omit=dev --prefix %{buildroot}/usr/lib/nuref

cat > %{buildroot}/usr/bin/nuref << 'EOF'
#!/bin/sh
exec node /usr/lib/nuref/cli/index.js "$@"
EOF
chmod +x %{buildroot}/usr/bin/nuref

cat > %{buildroot}/usr/bin/nuref-api << 'EOF'
#!/bin/sh
exec node /usr/lib/nuref/api/server.js "$@"
EOF
chmod +x %{buildroot}/usr/bin/nuref-api

%files
/usr/lib/nuref/
/usr/bin/nuref
/usr/bin/nuref-api
%license LICENSE
%doc README.md

%changelog
* Sat Jun 28 2025 nullgang <noreply@github.com/nullgang> - 1.0.0-1
- Universal Feed Processing Engine
- Fast regex parser (3-8x faster than XML parser)
- Safety hardening and resilient fetcher
- CLI and REST API server
