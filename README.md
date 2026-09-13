# Nova VIX ↔ ChatGPT - transferencia para Ing. Blas Rendón Century 21

Este repositorio es una copia pública temporal para que Codex pueda descargar el conector VIX e instalarlo en la computadora Windows del Ing. Blas Rendón Century 21.

## Lo único que debe hacer Blas

1. Descargar o abrir el anexo `PROMPT_PARA_CODEX.txt`.
2. Abrir Codex en su computadora Windows e iniciar sesión si se lo pide.
3. Copiar TODO el contenido de `PROMPT_PARA_CODEX.txt` y pegarlo en Codex como un solo mensaje.
4. Dejar que Codex haga el trabajo técnico. Blas sólo interviene cuando una acción humana no puede automatizarse: aceptar UAC/permisos de Windows, reiniciar, iniciar sesión, habilitar un permiso de su cuenta, introducir de forma segura la credencial restringida del Secure MCP Tunnel o realizar una confirmación en la interfaz web de ChatGPT.
5. No ejecutar comandos manualmente, no elegir entre alternativas técnicas y no compartir claves por WhatsApp, GitHub, correo ni chat.
6. Cuando Codex confirme con la prueba final que VIX funciona desde ChatGPT, enviar a Ramón exactamente: `VIX LISTO`.

El manual humano completo está en `docs/MANUAL_INSTALACION.md` y en el PDF adjunto `docs/Manual_Instalacion_Nova_VIX_ChatGPT_Blas_Rendon.pdf`.

## Requisito de ChatGPT que Codex debe comprobar primero

Estado verificado el 12 de septiembre de 2026 en documentación oficial de OpenAI:

- Full MCP con acciones completas está disponible en ChatGPT Business y Enterprise/Edu en la web.
- ChatGPT Pro sólo admite MCP con permisos read/fetch; no es suficiente para este conector VIX completo.
- ChatGPT Plus no debe tratarse como compatible con Full MCP para este conector.
- En Business, el usuario debe ser Admin/Owner para usar Developer Mode y desplegar la app personalizada.
- En Enterprise/Edu, el acceso a Developer Mode debe estar habilitado por el workspace según sus controles.
- Un MCP local no se conecta directamente a ChatGPT; para esta instalación se usa Secure MCP Tunnel.

Estas condiciones pueden cambiar. Codex debe comprobar la documentación oficial vigente antes de crear credenciales o configurar el túnel. Si el plan, rol o permisos reales no son suficientes, Codex debe detener únicamente esa parte, explicar exactamente el bloqueo y no comprar, actualizar ni modificar la suscripción por cuenta propia.

## Resultado técnico que Codex debe dejar probado

En Windows, Vix se ejecuta dentro de WSL2/Linux usando stock Vix 0.6.0. El repositorio contiene soporte verificado para descargar los binarios oficiales Linux con checksum.

La aceptación exige una prueba real desde ChatGPT que demuestre como mínimo:

- `vix_open` disponible y ejecutable;
- `vix_exchange` disponible y capaz de devolver un checkpoint de inferencia a ChatGPT;
- stock Vix 0.6.0;
- `modelCalls: 0`;
- ausencia de claves reales de proveedores dentro del proceso Vix.

Un proceso encendido o un health check por sí solos no equivalen a instalación terminada.

## Credenciales

Vix no debe recibir claves reales de OpenAI, Anthropic, OpenRouter, MiniMax, DeepSeek, Bedrock ni otros proveedores de modelos.

Secure MCP Tunnel sí necesita autenticación propia. Codex debe comprobar el contrato oficial vigente. A fecha de esta entrega:

- crear o editar un túnel requiere `Tunnels Read + Manage`;
- ejecutar `tunnel-client` o seleccionar el túnel al crear la app requiere `Tunnels Read + Use`;
- la credencial de ejecución debe ser una runtime API key dedicada y de mínimo privilegio.

La credencial del túnel autentica el transporte/control plane. No es una clave de inferencia para Vix. `modelCalls: 0` certifica que este conector no usa proveedores externos para resolver la inferencia de Vix; no debe interpretarse como una garantía de coste cero para cualquier uso diferente que alguien haga de una API key de OpenAI.
