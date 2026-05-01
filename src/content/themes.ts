import { ThemeContent } from "../types";

export const THEME_POOL: ThemeContent[] = [
  {
    id: "classic",
    name: "Casa familiar",
    suspects: ["Ana", "Bruno", "Carla", "Diego", "Elena", "Fabian", "Gabriela", "Hugo", "Ines"],
    victims: ["Victor", "Sofia"],
    weapons: ["Cuchillo", "Llave inglesa", "Cuerda", "Jarron", "Tijeras", "Martillo", "Lampara", "Palo", "Piedra"],
    locations: ["Cocina", "Salon", "Garaje", "Jardin", "Dormitorio", "Bano", "Pasillo", "Terraza", "Sotano"],
    events: ["Cena", "Apagon", "Llamada", "Discusion", "Visita", "Fiesta", "Mudanza", "Reunion", "Lluvia"]
  },
  {
    id: "futuristic",
    name: "Oficina moderna",
    suspects: ["Luis", "Marta", "Nora", "Oscar", "Paula", "Quino", "Raul", "Sara", "Tomas"],
    victims: ["Director Vega", "Clara"],
    weapons: ["Portatil", "Destornillador", "Cable", "Taza", "Cutter", "Archivador", "Regla", "Silla", "Cargador"],
    locations: ["Recepcion", "Despacho", "Sala reuniones", "Cocina oficina", "Archivo", "Pasillo", "Terraza", "Almacen", "Ascensor"],
    events: ["Cafe", "Llamada", "Entrega", "Reunion", "Descanso", "Cierre", "Incidencia", "Auditoria", "Mudanza"]
  },
  {
    id: "medieval",
    name: "Colegio",
    suspects: ["Alicia", "Beto", "Celia", "David", "Emma", "Felix", "Gema", "Ivan", "Julia"],
    victims: ["Profesor Leon", "Mateo"],
    weapons: ["Compas", "Libro", "Tijeras", "Mochila", "Regla metalica", "Botella", "Bate", "Cuerda", "Palo de hockey"],
    locations: ["Aula", "Biblioteca", "Patio", "Gimnasio", "Laboratorio", "Comedor", "Entrada", "Escaleras", "Taquillas"],
    events: ["Recreo", "Clase", "Examen", "Entrenamiento", "Asamblea", "Limpieza", "Ensayo", "Salida", "Tutorias"]
  },
  {
    id: "lab",
    name: "Hospital",
    suspects: ["Adrian", "Bea", "Ciro", "Diana", "Erik", "Fabiola", "Gonzalo", "Helena", "Isaac"],
    victims: ["Paciente Nunez", "Rocio"],
    weapons: ["Jeringa", "Tijeras medicas", "Bandeja", "Escalera", "Cable monitor", "Linterna", "Carro", "Guante", "Tubo"],
    locations: ["Urgencias", "Quirofano", "Habitacion", "Farmacia", "Recepcion", "Pasillo norte", "Almacen", "Cafeteria", "Laboratorio"],
    events: ["Guardia", "Visita", "Cambio turno", "Emergencia", "Alta", "Limpieza", "Ronda", "Analisis", "Traslado"]
  },
  {
    id: "cyberpunk",
    name: "Barrio nocturno",
    suspects: ["Alba", "Borja", "Carmen", "Dario", "Eva", "Fran", "Gloria", "Hector", "Irene"],
    victims: ["Marcos", "Nadia"],
    weapons: ["Botella", "Cadena", "Navaja", "Casco", "Llave", "Piedra", "Cuerda", "Linterna", "Baston"],
    locations: ["Bar", "Plaza", "Portal", "Parque", "Aparcamiento", "Tienda", "Callejon", "Parada bus", "Puente"],
    events: ["Concierto", "Lluvia", "Discusion", "Partido", "Mercado", "Patrulla", "Corte luz", "Cierre", "Encuentro"]
  },
  {
    id: "tropical",
    name: "Camping",
    suspects: ["Aitor", "Berta", "Cris", "Dani", "Esther", "Fede", "Gala", "Hugo", "Irma"],
    victims: ["Lucas", "Noelia"],
    weapons: ["Pala", "Cuerda", "Linterna", "Piedra", "Navaja", "Mochila", "Termo", "Sarten", "Palo"],
    locations: ["Entrada", "Lago", "Bosque", "Carpa", "Fogata", "Sendero", "Cocina", "Caseta", "Mirador"],
    events: ["Excursion", "Cena", "Lluvia", "Fogata", "Paseo", "Juego", "Desayuno", "Charla", "Descanso"]
  },
  {
    id: "space",
    name: "Centro comercial",
    suspects: ["Alvaro", "Blanca", "Carlos", "Diana", "Eva", "Fernando", "Greta", "Hector", "Inma"],
    victims: ["Ruben", "Silvia"],
    weapons: ["Paraguas", "Bolso", "Patinete", "Caja", "Cinturon", "Botella", "Cargador", "Baston", "Percha"],
    locations: ["Entrada", "Escaleras", "Tienda ropa", "Supermercado", "Cine", "Parking", "Pasillo", "Terraza", "Almacen"],
    events: ["Compras", "Cierre", "Oferta", "Corte luz", "Limpieza", "Cola", "Entrega", "Reunion", "Apertura"]
  },
  {
    id: "time",
    name: "Museo",
    suspects: ["Anais", "Brenda", "Cesar", "Dario", "Elisa", "Fabio", "Gina", "Hector", "Iago"],
    victims: ["Guia Pablo", "Teresa"],
    weapons: ["Estatua", "Cuerda", "Puntero", "Marco", "Linterna", "Escoba", "Tijeras", "Caja", "Soporte"],
    locations: ["Entrada", "Sala 1", "Sala 2", "Sala 3", "Archivo", "Escaleras", "Tienda", "Patio", "Oficina"],
    events: ["Visita guiada", "Exposicion", "Montaje", "Limpieza", "Cierre", "Apertura", "Conferencia", "Inventario", "Reparacion"]
  },
  {
    id: "pirates",
    name: "Urbanizacion",
    suspects: ["Alma", "Bruno", "Claudia", "Diego", "Elsa", "Felipe", "Gael", "Helena", "Ivan"],
    victims: ["Portero Raul", "Miriam"],
    weapons: ["Maceta", "Manguera", "Pala", "Bicicleta", "Llave", "Banco", "Palo", "Cuerda", "Tijeras jardin"],
    locations: ["Portal A", "Portal B", "Piscina", "Garaje", "Jardin", "Pista", "Trastero", "Entrada", "Parque"],
    events: ["Reunion vecinos", "Mantenimiento", "Paseo", "Fiesta", "Mudanza", "Lluvia", "Partido", "Cena", "Limpieza"]
  }
];

export const FREE_THEMES = new Set(["classic", "futuristic", "medieval"]);
