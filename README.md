# connect-box-ipv6-prefix-firewall-fix

Docker Container mit Node.js Script, das IPv6-Firewallregeln für das von einer Unitymedia Connect Box einer
nachgeschalteten Fritz!Box zugewiesene IPv6-Präfix in der Connect Box aktuell hält.

Das Script prüft in regelmäßigen Abständen, ob für das der Fritz!Box aktuell zugewiesene IPv6-Präfix in der Connect Box
passende Firewallregeln angelegt sind und korrigiert diese bei Bedarf.

Hintergrund: Die Connect Box aktualisiert bei Änderungen des IPv6-Präfix, das sie selbst verwendet, alle angelegten
Firewallregeln mit diesem Präfix. Firewallregeln für das IPv6-Präfix, das einer nachgeschalteten Fritz!Box zugewiesen
wurde, werden dadurch unwirksam.

**ACHTUNG:** Das Script löscht IPv6-Firewallregeln aus der Connect Box, siehe Script-Ablauf (unten).

Das Script muss auf einem Rechner ausgeführt werden, der sowohl auf die nachgeschaltete Fritz!Box als auch auf die
Connect Box Zugriff hat. Details zum Netzwerk Setup siehe unten.

## Script-Ablauf

- Ruft IPv6-Präfix von Fritz!Box ab
- Loggt sich in der Connect Box ein
- Ruft alle eingehenden und ausgehenden IPv6-Firewall Regeln ab
- Für die eingehenden Regeln:
  - Lösche alle Regeln mit *Ziel-Präfix-Länge = Länge des der Fritz!Box zugewiesenen Präfix* und *Ziel-Adresse !=
    aktuell der Fritz!Box zugewiesene Präfix-Adresse*.
  - Falls keine Regel mit *Ziel-Präfix-Länge = Länge des der Fritz!Box zugewiesenen Präfix* und *Ziel-Adresse = aktuell
    der Fritz!Box zugewiesene Präfix-Adresse* vorhanden ist, lege diese an (erlaube alles).
- Für die ausgehende Regeln:
  - Lösche alle Regeln mit *Quell-Präfix-Länge = Länge des der Fritz!Box zugewiesenen Präfix* und *Quell-Adresse !=
    aktuell der Fritz!Box zugewiesene Präfix-Adresse*.
  - Falls keine Regel mit *Quell-Präfix-Länge = Länge des der Fritz!Box zugewiesenen Präfix* und *Quell-Adresse =
    aktuell der Fritz!Box zugewiesene Präfix-Adresse* vorhanden ist, lege diese an (erlaube alles).
- Loggt sich aus Connect Box aus

Auf der Connect Box kann sich immer nur ein Nutzer gleichzeitig einloggen. Wenn bereits jemand eingeloggt ist schlägt
darum das Script fehl (i.d.R. mit Fehler 302).

## Konfiguration

Der Docker Container bzw. das Script scheduler.js lassen sich mit Umgebungsvariablen konfigurieren:

     FRITZ_BOX_HOST - Hostname oder IP-Adresse - Standardwert: fritz.box
     CONNECT_BOX_HOST - Hostname oder IP-Adresse - Standardwert: 192.168.0.1
     CONNECT_BOX_PASSWORD - Connect Box Passwort - Kein Standardwert
     RUN_ON_START - true oder false - Standardwert: true
     RUN_SCHEDULED - true oder false - Standardwert: true;
     CRON_TIME - siehe node-cron (https://www.npmjs.com/package/cron) - Standardwert: 0 */5 * * * * (alle 5 Minuten)
     
Mindestens muss `CONNECT_BOX_PASSWORD` gesetzt werden.

`CRON_TIME` ist nur von Bedeutung, wenn `RUN_SCHEDULED` true ist.

## Verwendung mit Docker

Einfach [das vorgefertigte Docker Image](https://hub.docker.com/r/skleeschulte/connect-box-ipv6-prefix-firewall-fix/)
installieren und über Umgebungsvariablen anpassen.

Der Docker-Container muss über das Netzwerk auf Fritz!Box und Connect Box zugreifen können. Ggf. muss daher `bridged`
Networking verwendet werden (und nicht NAT).

## Verwendung mit Node.js

    git clone https://github.com/skleeschulte/connect-box-ipv6-prefix-firewall-fix.git
    cd connect-box-ipv6-prefix-firewall-fix
    npm install

Vor dem Start Umgebungsvariablen anpassen, siehe oben. Dann:

    npm start
    
Getestet mit Node.js 8.

## Netzwerk Setup

Entwickelt wurde die Lösung für folgendes konkrete Setup:

- Unitymedia DS-Lite Anschluss
- Connect Box als Kabelmodem/Router (Hardware Version: 5.01, Software Version: CH7465LG-NCIP-6.12.18.24-5p4-NOSH)
- Fritz!Box 7490 über Kabel (Fritz!Box Port LAN 1) an Connect Box angeschlossen (FRITZ!OS: 06.93)
- Von den Standardeinstellungen / Werkseinstellungen abweichende Einstellungen in der Connect Box:
  - DHCP: MAC-Adresse der Fritz!Box immer die gleiche IPv4-Adresse zuweisen.
  - IP und Port Filter:
    - Eingehend:
      - Aktiviert
      - Traffic policy: Ja
      - Protokoll: Alle
      - Quell IP-Adresse: Alle
      - Ziel IP Adresse: Single - [IPv6 Adresse der Fritz!Box (nicht das Präfix!)]
    - Ausgehend:
      - Aktiviert
      - Traffic policy: Ja
      - Protokoll: Alle
      - Quell IP-Adresse: Single - [IPv6 Adresse der Fritz!Box (nicht das Präfix!)]
      - Ziel IP Adresse: Alle
    - Die Regeln für das der Fritz!Box zugeweisene IPv6-Präfix werden von dem Script automatisch angelegt.
- Einstellungen der Fritz!Box unter Internet -> Zugangsdaten:
  - Internetzugang
    - Internetanbieter: Unitymedia
    - Downstream / Upstream entsprechend Internetzugangsgeschwindigkeit
  - IPv6
    - IPv6-Unterstützung aktiv
    - Native IPv6-Anbindung verwenden (aber nicht IPv4-Anbindung über DS-Lite herstellen)
    - Globale Adresse ausschließlich per DHCPv6 beziehen
    - DHCPv6 Rapid Commit verwenden
    - MTU manuell einstellen: 1500 Byte

Computer im Fritz!Box Netzwerk können über die IP der Connect Box (Standard: 192.168.0.1) auf diese zugreifen.