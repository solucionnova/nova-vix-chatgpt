# Manual de instalación — Nova VIX ↔ ChatGPT

**Destinatario:** Ing. Blas Rendón Century 21<br>
**Sistema objetivo:** Windows con WSL2/Linux<br>
**Repositorio temporal:** `https://github.com/solucionnova/nova-vix-chatgpt`

## 1. Qué tiene que hacer Blas

Blas no necesita instalar programas, escribir comandos ni escoger opciones técnicas por su cuenta. El procedimiento está diseñado para que Codex haga todo el trabajo.

La intervención humana se limita a cuatro situaciones inevitables: autorizar Windows/UAC o un reinicio; iniciar sesión cuando una plataforma lo exija; resolver una incompatibilidad real del plan de ChatGPT; y proporcionar la credencial restringida del Secure MCP Tunnel cuando Codex llegue a ese punto.

El flujo para Blas es:

1. Abrir `PROMPT_PARA_CODEX.txt` en el repositorio.
2. Copiarlo completo y pegarlo en Codex.
3. Hacer únicamente las acciones humanas que Codex le pida expresamente.
4. Esperar la prueba final de VIX dentro de ChatGPT.
5. Enviar a Ramón exactamente `VIX LISTO`.

El repositorio estará público sólo durante esta transferencia. Después de recibir `VIX LISTO`, Ramón podrá volverlo privado o retirar el repositorio temporal.

## 2. Arquitectura que Codex debe dejar funcionando

El flujo esperado es:

`ChatGPT → Secure MCP Tunnel → MCP local 127.0.0.1:18816 → stock Vix 0.6.0 en WSL2/Linux → checkpoint de inferencia → ChatGPT`

Vix no debe resolver los checkpoints llamando a un proveedor de modelos. El conector devuelve la solicitud de inferencia a ChatGPT mediante `vix_exchange` y ChatGPT responde. La certificación final debe conservar `modelCalls: 0`.

## 3. Windows y WSL2

Vix no debe presentarse como una aplicación nativa de Windows si su soporte oficial vigente no lo ofrece. Para esta instalación, Codex debe usar WSL2 y una distribución Linux compatible.

Codex debe detectar el estado real de Windows, habilitar/configurar WSL2 y la distribución si hace falta, instalar las dependencias dentro del entorno correcto y recuperar automáticamente el trabajo después de un reinicio. Blas sólo autoriza UAC, reinicia o inicia sesión cuando Codex indique que es inevitable.

El repo incluye selección verificada de los binarios oficiales de stock Vix 0.6.0 para las plataformas soportadas. Codex debe verificar siempre versión y checksum.

## 4. Requisito de ChatGPT

Antes de crear credenciales o túneles, Codex debe consultar la documentación oficial vigente de OpenAI y comprobar que el plan/workspace de Blas permite Full MCP con las acciones que necesita este conector.

La disponibilidad de planes y Developer Mode puede cambiar. Por eso el instructivo no debe tratar una matriz de planes antigua como una garantía permanente. Si el plan actual no admite `vix_open` y `vix_exchange`, Codex debe detenerse únicamente para explicar ese bloqueo real y qué habilitación o plan compatible se requiere.

## 5. Instalación técnica a cargo de Codex

Codex debe asumir de principio a fin las tareas técnicas: clonar el repositorio, preparar WSL2/Linux, instalar Node y dependencias, instalar stock Vix 0.6.0, ejecutar pruebas y certificación, configurar el MCP local y dejar un mecanismo de persistencia apropiado para WSL2/Linux.

Cuando systemd de usuario esté disponible y sea adecuado, puede usarse para la persistencia. Si la máquina real necesita otro mecanismo soportado, Codex debe decidirlo sin trasladar esa decisión a Blas.

El MCP debe permanecer ligado a loopback, por defecto `127.0.0.1:18816`. No debe exponerse directamente a Internet.

## 6. Barreras contra consumo de modelos externos

El diseño conserva estas garantías:

- las credenciales reales de proveedores se eliminan del entorno del proceso Vix;
- los providers de stock Vix se redirigen al gateway/loopback controlado por el conector;
- se utiliza sólo un token sintético cuando Vix necesita un valor de preflight;
- la telemetría de Vix permanece desactivada;
- las solicitudes de inferencia regresan a ChatGPT;
- la ejecución certificada reporta `modelCalls: 0`.

En macOS el runtime actual añade además `sandbox-exec` y bloqueo del acceso a Keychain. En Linux/WSL2 esa protección específica de macOS no se debe afirmar: la garantía portable se basa en el entorno sanitizado, provider overlay/loopback y ausencia de fallback a proveedores.

Blas no debe proporcionar `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, OpenRouter, MiniMax, DeepSeek u otras claves de modelos para que Vix haga inferencia.

## 7. Secure MCP Tunnel y la única clave necesaria

Una vez que Codex haya demostrado que el MCP local está instalado, probado y listo, debe configurar Secure MCP Tunnel utilizando la documentación oficial vigente de OpenAI.

Codex decide dónde debe ejecutarse el cliente del túnel —Windows o WSL2— según el contrato oficial actual y resuelve la comunicación hasta:

`http://127.0.0.1:18816/mcp`

Sólo cuando el túnel esté listo para autenticarse, Codex debe pedir intervención de Blas.

La credencial debe ser dedicada y de mínimo privilegio. Según el contrato documentado actualmente, debe limitarse a:

- Tunnels Read
- Tunnels Use

Si OpenAI cambia esos nombres o el proceso, Codex debe usar el equivalente oficial vigente.

Esta credencial autentica el Secure MCP Tunnel/control plane. **No es una clave para que Vix haga inferencia.** No debe guardarse en Git, archivos planos, logs ni argumentos visibles. Codex debe usar el almacenamiento seguro recomendado oficialmente.

Una clave de OpenAI puede generar cargos si alguien la utiliza deliberadamente en endpoints facturables fuera de este diseño. `modelCalls: 0` significa que el conector Vix no realiza esas llamadas de modelo por su cuenta; no convierte una credencial de OpenAI en universalmente gratuita.

## 8. Conexión en ChatGPT

Con el MCP y el túnel sanos, Codex debe guiar únicamente las acciones humanas inevitables de la interfaz de ChatGPT: activar la capacidad necesaria, seleccionar/agregar el MCP correspondiente y permitir que ChatGPT descubra sus herramientas.

La instalación no se considera terminada hasta que ChatGPT vea, como mínimo:

- `vix_open`
- `vix_exchange`

Si la interfaz cambió, Codex debe seguir la documentación oficial vigente en lugar de repetir nombres de menús antiguos.

## 9. Prueba final obligatoria

Codex debe ejecutar una prueba real desde ChatGPT. La evidencia de aceptación debe demostrar:

- stock Vix 0.6.0;
- una conexión abierta mediante `vix_open`;
- al menos un checkpoint recibido mediante `vix_exchange`;
- respuesta de ese checkpoint por el propio ChatGPT;
- `modelCalls: 0`;
- ausencia de claves reales de proveedores dentro del proceso Vix;
- cierre exitoso de la prueba.

Un proceso encendido o un `/healthz` correcto no bastan por sí solos.

## 10. Qué debe hacer Blas si Codex se detiene

Blas no debe intentar solucionar el problema manualmente. Sólo debe realizar la acción humana concreta que Codex indique: aceptar UAC, reiniciar Windows, iniciar sesión, habilitar una capacidad de ChatGPT o proporcionar la credencial restringida del túnel.

Después, debe decirle a Codex que continúe. Codex conserva la responsabilidad de terminar el diagnóstico y la instalación.

## 11. Cierre del intercambio

Cuando Codex confirme que la prueba completa pasó, debe mostrar a Blas esta instrucción:

`VIX quedó instalado y probado. Ahora envía a Ramón exactamente este mensaje: VIX LISTO`

Al recibir `VIX LISTO`, Ramón sabrá que puede volver privado o retirar el repositorio público temporal utilizado para la transferencia.
