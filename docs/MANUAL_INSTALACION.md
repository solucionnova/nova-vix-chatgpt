# Manual de entrega e instalación - Nova VIX ↔ ChatGPT

**Destinatario:** Ing. Blas Rendón Century 21<br>
**Sistema:** Windows con WSL2/Linux<br>
**Repositorio temporal:** `https://github.com/solucionnova/nova-vix-chatgpt`<br>
**Objetivo:** que Blas copie un solo prompt en Codex y Codex haga toda la instalación, configuración, diagnóstico y prueba.

## 1. Qué recibe Blas

Ramón le envía dos anexos:

1. `PROMPT_PARA_CODEX.txt` - es el archivo que Blas debe copiar completo y pegar en Codex. Es la instrucción operativa.
2. `Manual_Instalacion_Nova_VIX_ChatGPT_Blas_Rendon.pdf` - es una explicación humana para saber qué ocurrirá y qué hacer si aparece alguna duda.

El código se obtiene desde el repositorio público temporal. Blas no necesita descargar archivos de código uno por uno.

## 2. Qué debe hacer Blas, exactamente

1. Abrir Codex en su computadora Windows.
2. Si Codex pide iniciar sesión, iniciar sesión con su propia cuenta.
3. Abrir `PROMPT_PARA_CODEX.txt`.
4. Seleccionar y copiar todo el contenido, desde la primera hasta la última línea.
5. Pegar ese contenido en Codex como un solo mensaje y enviarlo.
6. A partir de ahí, no ejecutar comandos manualmente ni escoger opciones técnicas. Codex debe hacerlo.
7. Sólo realizar acciones humanas inevitables cuando Codex las describa claramente: aceptar UAC/permisos, reiniciar Windows, iniciar sesión, habilitar un permiso de cuenta, introducir de forma segura la clave del túnel o hacer un clic/confirmación en ChatGPT web.
8. No enviar claves por WhatsApp, GitHub, correo ni a Ramón.
9. Cuando Codex confirme que la prueba final pasó, enviar a Ramón exactamente: `VIX LISTO`.

## 3. Qué hará Codex

Codex debe encargarse de:

- obtener/clonar el repo;
- inspeccionar Windows y WSL2;
- habilitar/configurar WSL2 y Linux si hace falta;
- instalar dependencias;
- instalar stock Vix 0.6.0 con checksum verificado;
- ejecutar tests y certificación;
- configurar persistencia dentro de WSL2/Linux;
- mantener el MCP local en loopback;
- configurar Secure MCP Tunnel;
- guiar las pocas acciones de cuenta/interfaz que Blas deba hacer personalmente;
- conectar la app/MCP en ChatGPT web;
- ejecutar la prueba final de `vix_open`/`vix_exchange` y `modelCalls: 0`.

## 4. Requisito de ChatGPT - comprobar antes de crear claves

Estado verificado el 12 de septiembre de 2026 en documentación oficial de OpenAI:

- Full MCP con acciones completas está disponible en ChatGPT Business y Enterprise/Edu en la web.
- ChatGPT Pro puede conectar MCP con permisos read/fetch, pero Full MCP no está disponible; por eso Pro no es suficiente para este VIX completo.
- ChatGPT Plus tampoco debe tratarse como suficiente para Full MCP de este conector.
- En Business, sólo Admins/Owners pueden usar Developer Mode para crear/desplegar la app personalizada.
- En Enterprise/Edu, el workspace debe conceder el acceso correspondiente a Developer Mode.
- Las apps MCP personalizadas se usan en la web de ChatGPT; Codex no debe asumir que la app móvil o cualquier otra superficie ofrece la misma capacidad.

OpenAI puede cambiar estas reglas. Codex debe verificar siempre la documentación oficial vigente antes de seguir.

### Si el plan o rol no sirve

Codex debe detener únicamente la parte dependiente de ChatGPT y explicar qué falta. No debe comprar ni actualizar un plan por su cuenta.

Blas debe copiar el texto exacto del bloqueo y enviarlo a Ramón precedido por:

`VIX BLOQUEADO - PLAN/ROL:`

Después debe esperar indicaciones de Ramón.

## 5. Windows y WSL2

Vix 0.6.0 se instala para este intercambio dentro de WSL2/Linux. El repositorio incluye selección de binarios oficiales Linux amd64/arm64 y sus checksums.

Codex debe verificar el estado real de Windows y WSL2 antes de instalar. Si WSL2 requiere una habilitación o un reinicio, Codex debe pedir una sola acción humana concreta y, después del reinicio, comprobar qué quedó instalado antes de continuar.

Blas no debe escribir comandos para WSL2 ni elegir distribución, rutas, paquetes o mecanismos de servicio. Codex decide lo técnico.

## 6. Qué significa que ChatGPT sea la única inferencia

El conector está diseñado para que Vix mantenga sus herramientas y runtime, pero los checkpoints de inferencia vuelvan a ChatGPT mediante el conector.

La certificación comprueba, entre otras cosas:

- stock Vix 0.6.0;
- provider overlay local;
- eliminación de claves reales de proveedores del entorno de Vix;
- telemetría desactivada;
- comportamiento portable Linux;
- `modelCalls: 0`.

Blas no debe entregar una `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, clave de OpenRouter, MiniMax, DeepSeek, Bedrock ni otra clave de modelos para Vix.

## 7. Secure MCP Tunnel

ChatGPT no se conecta directamente a un MCP que sólo escucha localmente. La vía oficial es Secure MCP Tunnel: `tunnel-client` abre una conexión HTTPS saliente hacia OpenAI y reenvía las solicitudes al MCP privado sin exponer ese MCP directamente a Internet.

El destino local de este conector es:

`http://127.0.0.1:18816/mcp`

Codex debe ejecutar `tunnel-client` en un lugar desde el cual ese destino sea alcanzable de forma fiable y seguir el contrato oficial vigente.

## 8. Dos tipos de permiso que no deben confundirse

Developer Mode de ChatGPT y los permisos de túnel de OpenAI Platform son controles separados.

Referencia vigente al 12-09-2026:

- para crear o editar un túnel: `Tunnels Read + Manage`;
- para ejecutar `tunnel-client` o seleccionar el túnel al crear la app: `Tunnels Read + Use`;
- `tunnel-client` necesita un `tunnel_id` y una runtime API key.

Si Blas no posee el rol necesario para crear/asociar el túnel o para usarlo, Codex debe explicar el bloqueo exacto. Blas debe enviarlo a Ramón como:

`VIX BLOQUEADO - PERMISOS OPENAI:`

No debe intentar resolver permisos administrativos al azar.

## 9. Momento exacto de la clave

Codex no debe pedir la clave del túnel al principio.

Sólo debe pedirla cuando ya se hayan cumplido estas condiciones:

1. MCP local instalado.
2. Tests y certificación correctos.
3. Plan/rol de ChatGPT compatible.
4. Túnel creado o seleccionado y `tunnel_id` correcto.
5. `tunnel-client` preparado hasta el punto en que falte autenticarse.

En ese momento Codex debe mostrar claramente:

`ACCIÓN HUMANA NECESARIA - CLAVE DEL TÚNEL`

La clave de ejecución debe ser una runtime API key dedicada y de mínimo privilegio con `Tunnels Read + Use`, o el equivalente oficial vigente.

Esa clave autentica Secure MCP Tunnel. No es una clave para que Vix haga inferencia. Blas debe introducirla únicamente en el flujo seguro/local que Codex le indique. No debe pegarla en WhatsApp, GitHub, documentos, capturas ni enviársela a Ramón.

Si Codex pide una clave de modelo para Vix, Blas no debe proporcionarla y debe responder:

`NO TE DARÉ UNA CLAVE DE MODELO PARA VIX. REVISA EL REPO Y CONSERVA CHATGPT COMO ÚNICA AUTORIDAD DE INFERENCIA. CONTINÚA.`

## 10. Qué hacer en cada situación que pueda generar duda

### Codex termina una respuesta, pero todavía no dice que VIX quedó probado

Responder exactamente:

`CONTINÚA HASTA TERMINAR TODO EL PROCESO. RESUELVE POR TU CUENTA CUALQUIER PROBLEMA TÉCNICO REVERSIBLE Y DETENTE ÚNICAMENTE SI NECESITAS UNA ACCIÓN HUMANA INEVITABLE.`

### Windows se reinicia

Abrir de nuevo Codex y, si está disponible, la misma conversación. Escribir:

`RETOMA LA INSTALACIÓN DE VIX DESDE EL ESTADO ACTUAL. COMPRUEBA QUÉ YA QUEDÓ HECHO DESPUÉS DEL REINICIO Y CONTINÚA SIN REPETIR EFECTOS.`

### Codex perdió el contexto o se abrió un chat nuevo

Volver a pegar completo `PROMPT_PARA_CODEX.txt` y añadir al final:

`ESTO ES UNA REANUDACIÓN. INSPECCIONA EL ESTADO ACTUAL ANTES DE REPETIR CUALQUIER INSTALACIÓN Y CONTINÚA DESDE LO QUE YA ESTÉ HECHO.`

### Codex pregunta cuál alternativa técnica elegir

Responder:

`ELIGE TÚ LA OPCIÓN SEGURA, SIMPLE Y SOPORTADA QUE CUMPLA EL OBJETIVO Y CONTINÚA.`

### Aparece un error

Responder:

`DIAGNOSTICA LA CAUSA, CORRIGE LO REVERSIBLE Y CONTINÚA. PÍDEME SÓLO UNA ACCIÓN QUE YO DEBA HACER PERSONALMENTE.`

### Codex pide UAC, login o un permiso

Seguir únicamente la acción concreta que Codex describa. Antes de hacer clic, comprobar que Codex indique dónde hacerlo y qué debe verse. Después responder con la frase de continuación que Codex haya indicado.

### Codex pide una clave demasiado pronto

Responder:

`NO TE DARÉ NINGUNA CLAVE HASTA QUE EL MCP LOCAL ESTÉ INSTALADO Y PROBADO, EL PLAN SEA COMPATIBLE, EXISTA EL TUNNEL_ID CORRECTO Y EL CLIENTE DEL TÚNEL ESTÉ LISTO PARA AUTENTICARSE. CONTINÚA CON LO QUE FALTE.`

### Codex dice que el plan/rol/permisos no permiten continuar

No comprar ni cambiar nada. Copiar el bloqueo exacto y enviárselo a Ramón usando uno de estos encabezados:

- `VIX BLOQUEADO - PLAN/ROL:`
- `VIX BLOQUEADO - PERMISOS OPENAI:`

### Codex confirma que todo funciona

Asegurarse de que también diga que hizo una prueba real desde ChatGPT y que verificó stock Vix 0.6.0 y `modelCalls: 0`.

Después enviar a Ramón exactamente:

`VIX LISTO`

## 11. Prueba final que define “terminado”

La instalación sólo termina cuando una prueba real desde ChatGPT web demuestra:

- `vix_open` disponible y ejecutado;
- `vix_exchange` recibe al menos un checkpoint de inferencia;
- el propio ChatGPT responde ese checkpoint;
- stock Vix 0.6.0;
- `modelCalls: 0`;
- ninguna clave real de proveedor fue entregada a Vix;
- el turno termina correctamente.

Un proceso encendido, un puerto escuchando, `/healthz` o `/readyz` son evidencia útil, pero no sustituyen la prueba completa.

## 12. Cierre del intercambio

Cuando Ramón reciba `VIX LISTO`, sabrá que puede volver privado o retirar el repositorio público temporal. Si recibe un mensaje `VIX BLOQUEADO`, podrá resolver primero el requisito de cuenta/permisos sin obligar a Blas a diagnosticar nada técnico.
