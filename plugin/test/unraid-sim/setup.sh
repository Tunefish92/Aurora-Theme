#!/bin/bash
# Fake Unraid server root (run by inside.sh, in its namespaces): Unraid's real webGui from a
# checkout at /usr/local/emhttp, minimal emhttp state, /boot/config, a stand-in for the header
# web components (dynamix.my.servers, not part of the webGui repository), the fake docker and
# ip commands, and the service scripts the Dashboard asks.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
WEBGUI=${1:?webgui checkout}
cp -a "$WEBGUI/emhttp/." /usr/local/emhttp/
mkdir -p /var/local/emhttp /boot/config/plugins/dynamix /boot/config/plugins/dockerMan/templates-user /boot/config/shares \
  /var/lib/docker /var/run /tmp/plugins /tmp/sim /tmp/tailscale /usr/local/emhttp/plugins/dynamix.my.servers/include
cat > /var/local/emhttp/var.ini <<'INI'
NAME="Tower"
version="7.2.0"
mdState="STARTED"
fsState="Started"
regTy="Pro"
regBuildTime="1750000000"
csrf_token="0123456789ABCDEF"
safeMode="no"
mdColor="green-on"
mdResync="0"
shareCacheEnabled="yes"
INI
for f in devs disks sec sec_nfs shares users; do : > /var/local/emhttp/$f.ini; done
printf '[eth0]\nBONDING="no"\nBRIDGING="yes"\nBRNAME="br0"\nIPADDR:0="192.168.1.2"\nUSE_DHCP:0="no"\n' > /var/local/emhttp/network.ini
: > /boot/config/plugins/dynamix/dynamix.cfg
printf 'DOCKER_ENABLED="yes"\nDOCKER_READMORE="yes"\n' > /boot/config/docker.cfg
# Report.php's flash check wants these readable.
for f in ident disk share flash domain; do echo 'FAKE="yes"' > /boot/config/$f.cfg; done
touch /var/run/dockerd.pid
cp "$HERE/myservers1.php" "$HERE/myservers2.php" /usr/local/emhttp/plugins/dynamix.my.servers/include/
echo '{}' > /tmp/tailscale/tailscale-derpmap.json
echo '{"TarballsVersion":"1.80.0"}' > /tmp/tailscale/tailscale-latest-version.json
# "Docker is busy" is a process named rc.docker.
cp /bin/sleep /tmp/sim/rc.docker
# Unraid's PHP puts /usr/local/sbin first on its PATH.
ln -sf "$HERE/docker-cli.sh" /usr/local/sbin/docker
ln -sf "$HERE/ip.sh" /usr/local/sbin/ip
printf '#!/bin/sh\nexit 0\n' > /etc/rc.d/rc.docker
printf '#!/bin/sh\n[ -f /var/run/libvirt/libvirtd.pid ]\n' > /etc/rc.d/rc.libvirt
chmod +x /etc/rc.d/rc.docker /etc/rc.d/rc.libvirt
