# Plesk Reverse Proxy

1. Eine Subdomain anlegen und ein gültiges TLS-Zertifikat aktivieren.
2. Das Projekt auf dem Docker-Host entpacken, `.env` konfigurieren und
   `docker compose up -d --build` ausführen.
3. Die Subdomain an den lokalen Frontend-Port weiterleiten. In den zusätzlichen
   nginx-Direktiven für die Domain die bestehende `location /` konfigurieren oder
   über Plesk Docker-Proxyregeln ersetzen. Keine zweite identische `location /`
   hinzufügen, falls Plesk diese bereits erzeugt.

Beispiel für den Reverse-Proxy-Block:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
}
```

`PUBLIC_ORIGIN` muss genau die HTTPS-Origin der Subdomain sein. Keine Domain ist
im Anwendungscode fest verdrahtet. Die interne nginx-Konfiguration routet sowohl
HTTP als auch WebSockets an das Backend. HTTP auf HTTPS umleiten.

`/health` prüft den laufenden Prozess; `/ready` prüft Redis und PostgreSQL.
Bei Problemen zuerst nginx-Konfiguration und danach Backend-Logs prüfen.
Plesk-spezifische Generierungsregeln unterscheiden sich: bei einem Konflikt den
Proxyblock über die Plesk-Vorlagen oder Docker-Proxyfunktion eintragen.

## Backup und Updates

Vor Updates Datenbankdump und Redis-Volume sichern. Danach neues Paket einspielen
und `docker compose up -d --build` ausführen. `docker compose down -v` löscht Daten
und ist kein normaler Aktualisierungsschritt.

## Mehrere Instanzen

Frontend-nginx benötigt dann eine Upstream-Gruppe oder einen vorgeschalteten
Loadbalancer statt des einzelnen `backend:3001`. WebSocket-only bedeutet, dass
keine HTTP-Polling-Stickiness benötigt wird. Bei Netzwerken, die WebSockets sperren,
gibt es in dieser Version keinen Long-Polling-Fallback.
