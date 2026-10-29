/* global escritorio */
const elemento = id => document.getElementById(id);
const estado = await escritorio.estado();
for (const nombre of ['servidor', 'feed']) elemento(nombre).value = estado[nombre] || '';
for (const nombre of ['inicio', 'avisos', 'citas']) elemento(nombre).checked = !!estado[nombre];
if (estado.nombre) { elemento('titulo').textContent = estado.nombre; document.title = estado.nombre; }
if (estado.offline) { elemento('descripcion').textContent = 'Sin conexión. Comprueba la red y vuelve a intentarlo. No se han guardado conversaciones en este equipo.'; elemento('reintentar').hidden = false; }
elemento('formulario').addEventListener('submit', async e => {
  e.preventDefault(); const boton = e.submitter; boton.disabled = true; elemento('error').textContent = '';
  const datos = Object.fromEntries(['servidor', 'feed'].map(k => [k, elemento(k).value]));
  for (const k of ['inicio', 'avisos', 'citas']) datos[k] = elemento(k).checked;
  try { const r = await escritorio.guardar(datos); if (r.error) elemento('error').textContent = r.error; }
  catch { elemento('error').textContent = 'No se pudo guardar. Revisa la conexión.'; }
  finally { boton.disabled = false; }
});
elemento('reintentar').addEventListener('click', () => escritorio.abrir());
