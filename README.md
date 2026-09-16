# Nova Vix ↔ ChatGPT

Conector de ingeniería que expone stock Vix a ChatGPT sin delegar inferencia. ChatGPT conserva criterio e inferencia; el runtime Vix opera con `modelCalls=0` y recibe checkpoints/respuestas a través del bridge local.

## Runtime actual

- Servicio macOS: `com.ramon.nova-vix-chatgpt`.
- MCP loopback: `127.0.0.1:18816` (`/mcp`, `/healthz`, `/readyz`).
- Stock runtime: Vix `v0.6.0`.
- Inferencia: exclusivamente ChatGPT mediante loopback; no requiere claves reales de proveedores dentro de Vix.
- Transporte externo: Cloudflare Tunnel compartido de ingeniería, owner externo al repo. Este repo no instala ni administra OpenAI `tunnel-client`.

El listener permanece en loopback; Cloudflare publica la ruta externa desde la Mac de Nova. Hostname, tunnel ID y credenciales no se versionan aquí.

## Superficie ChatGPT

- `vix_open`: abre o reanuda una sesión stock Vix.
- `vix_exchange`: intercambia eventos/checkpoints e inference requests; ChatGPT responde cada `request_id`.

La aceptación operativa requiere `readyz` con `ready=true`, `modelCalls=0`, stock Vix esperado y una prueba real desde ChatGPT cuando cambie el contrato visible o el transporte.

## Desarrollo

```sh
npm ci
npm test
npm run certify
```

Instalación del runtime stock:

```sh
npm run install:vix
```

Lifecycle macOS:

```sh
./ops/install-launchd-macos.sh
```

El transporte Cloudflare se gestiona fuera de este repo mediante el owner compartido de conectores de ingeniería. No reintroducir Secure MCP Tunnel/OpenAI `tunnel-client` como fallback.
