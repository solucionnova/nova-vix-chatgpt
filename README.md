# Nova VIX ↔ ChatGPT — instalación para Ing. Blas Rendón Century 21

Este repositorio estará **público sólo temporalmente** para que Codex pueda descargar el código e instalar el conector VIX en su computadora.

Usted no necesita instalar ni configurar nada manualmente.

## Qué tiene que hacer

1. Abra el archivo `PROMPT_PARA_CODEX.txt` de este repositorio: `https://github.com/solucionnova/nova-vix-chatgpt`.
2. Copie **todo** el contenido del archivo y péguelo en Codex.
3. Deje que Codex haga la instalación completa. Intervenga únicamente si Codex le pide una acción humana inevitable, como autorizar Windows, reiniciar, iniciar sesión o proporcionar la credencial restringida del Secure MCP Tunnel.
4. Espere a que Codex termine las pruebas y confirme que VIX funciona desde ChatGPT con stock Vix 0.6.0 y `modelCalls: 0`.
5. Cuando Codex confirme que todo está listo, envíe a Ramón exactamente: `VIX LISTO`.

**No ejecute comandos por su cuenta ni elija opciones técnicas.** Codex debe tomar esas decisiones y resolver la instalación de principio a fin.

La instalación en Windows usa WSL2/Linux para ejecutar Vix. El procedimiento técnico completo para Codex está en `docs/MANUAL_INSTALACION.md`.
