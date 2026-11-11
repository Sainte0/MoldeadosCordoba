import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Escaner, idDePalet } from '../Escaner';
import { Cabecera, Campo, Entrada } from '../ui';

/** Escanear la etiqueta de un palet y abrir su ficha (historia completa). Si la cámara no lee, por número. */
export function Escanear() {
  const ir = useNavigate();
  const [mensaje, setMensaje] = useState('Apuntá a la etiqueta del palet');
  const [numero, setNumero] = useState('');
  const leido = (texto: string) => {
    const id = idDePalet(texto);
    if (id) ir(`/palets/${id}`);
    else setMensaje('Ese código no es de un palet. Probá con la etiqueta del palet.');
  };
  return (
    <div className="columna" style={{ display: 'grid', gap: 16 }}>
      <Cabecera titulo="Escanear palet" bajada="Muestra la historia del palet: qué es, de qué producción salió y si ya se vendió." />
      <Escaner onCodigo={leido} mensaje={mensaje} alternativa="escribí el número del palet acá abajo" />
      <form onSubmit={(e) => { e.preventDefault(); if (numero) ir(`/palets/${Number(numero)}`); }} style={{ display: 'grid', gap: 10 }}>
        <Campo etiqueta="¿No lee la etiqueta? Escribí el número del palet">
          <Entrada inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="Ej.: 12" />
        </Campo>
        {numero && <button className="boton primario">Ver palet {numero}</button>}
      </form>
    </div>
  );
}
