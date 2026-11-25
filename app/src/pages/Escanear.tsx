import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Escaner, idDePalet } from '../Escaner';
import { Cabecera, Campo, Entrada } from '../ui';

/** Escanear la etiqueta de un pallet y abrir su ficha (historia completa). Si la cámara no lee, por número. */
export function Escanear() {
  const ir = useNavigate();
  const [mensaje, setMensaje] = useState('Apuntá a la etiqueta del pallet');
  const [numero, setNumero] = useState('');
  const leido = (texto: string) => {
    const id = idDePalet(texto);
    if (id) ir(`/palets/${id}`);
    else setMensaje('Ese código no es de un pallet. Apuntá al QR de la etiqueta del pallet.');
  };
  return (
    <div className="columna" style={{ display: 'grid', gap: 16 }}>
      <Cabecera titulo="Escanear pallet" bajada="Muestra qué pallet es, si está en la fábrica o a quién se vendió. Para cargar un camión, entrá a la orden." />
      <Escaner onCodigo={leido} mensaje={mensaje} alternativa="escribí el número del pallet acá abajo" />
      <form onSubmit={(e) => { e.preventDefault(); if (numero) ir(`/palets/${Number(numero)}`); }} style={{ display: 'grid', gap: 10 }}>
        <Campo etiqueta="¿No lee la etiqueta? Escribí el número del pallet">
          <Entrada inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="Ej.: 12" />
        </Campo>
        <button className="boton primario" disabled={!numero}>{numero ? `Ver pallet ${numero}` : 'Ver pallet'}</button>
      </form>
    </div>
  );
}
