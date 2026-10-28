# Historial privado del enlace Wompi

Roberto quiere consultar en la aplicación el historial y el total recaudado del enlace `VdTCSO`, junto con la identidad disponible de cada pagador. Solo los administradores deben acceder a estos datos.

## Estado

La vista y la tabla son una base local de solo lectura: no reciben eventos ni importan pagos. La sincronización está desconectada y el historial no es completo. No se debe presentar un total vacío como si reflejara lo recaudado en Wompi. El total mostrado cuando existan registros es bruto de pagos aprobados y no representa liquidaciones netas, comisiones ni devoluciones.

El endpoint público de Wompi identificó el enlace como `fitmagra systems`, activo y de uso múltiple el 2026-10-28. No demuestra pagos, pagadores ni autorización de cobros recurrentes. [Links de pago](https://docs.wompi.co/docs/colombia/links-de-pago/)

## Trabajo pendiente

1. Confirmar con Wompi y con el reporte del comercio cómo obtener el histórico completo de este enlace, qué fechas y campos están disponibles y si incluye el ID del enlace, correo y nombre del pagador. Wompi documenta reportes configurables, pero la documentación revisada no garantiza el período disponible ni la presencia de todos esos campos. [Reporte único](https://docs.wompi.co/docs/colombia/reporte-unico/)
2. Crear una importación privada y auditable que valide el origen y asocie cada transacción con el enlace correcto. Reimportaciones deben ser idempotentes; conciliar conteos, fechas y montos con Wompi antes de afirmar que el histórico está completo. No incluir reportes con datos de clientes en el repositorio o en los logs.
3. Implementar recepción de eventos y consulta del estado autoritativo en el backend. El ejemplo de Wompi firma solo algunas propiedades; no confiar en correo o ID del enlace cuando no estén firmados. Verificar el ID del enlace y los datos del pagador en una respuesta autenticada antes de guardarlos. Si no se pueden verificar, dejar la operación pendiente de revisión. [Eventos](https://docs.wompi.co/docs/colombia/eventos/), [seguimiento](https://docs.wompi.co/docs/colombia/seguimiento-de-transacciones/)
4. Manejar duplicados, reintentos, cambios de estado, anulaciones, devoluciones y eventos fuera de orden. Separar importe aprobado bruto, devoluciones y liquidación neta si existen datos confiables; no estimar comisiones o dinero recibido.
5. Aplicar los controles de acceso y privacidad a la importación, almacenamiento y visualización: mínimo de datos, acceso solo a administradores, respuestas privadas sin caché, escapes, registro de acciones y política de conservación y borrado revisada por abogado. No exponer claves al navegador.
6. Probar aislamiento entre administradores y miembros, datos sin nombre, cantidades grandes, duplicados, alteraciones, devoluciones, formatos inválidos y conciliación. Ejecutar las pruebas reales en un entorno aislado antes del lanzamiento.
