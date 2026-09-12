/* ---------------------------------------------------------
   3) RENDU D3 — axe VERTICAL unique + nœuds + arcs
   Dépend de data.js (people, events, allArcs, recomputeArcs,
   applyRealtimeChange, color, typeColor, TYPE_EMOJIS, EVENT_TYPES)
   et de storage.js (subscribeToEvents).

   Pivot (17/08) : la frise est passée à la verticale — le temps descend
   de haut en bas plutôt que de gauche à droite. Objectif : les titres
   d'évènements se lisent horizontalement (fini la troncature/le
   chevauchement de la version horizontale), et le rendu évoque un arbre
   de vie — un tronc vertical duquel partent des branches à gauche/droite.
   Toute la géométrie ci-dessous est la version "tournée à 90°" du POC
   horizontal précédent : mêmes principes (axe unique, arcs par personne,
   zoom continu, tronc fluvial), juste x↔y échangés.
--------------------------------------------------------- */

const margin = { top: 30, right: 30, bottom: 30, left: 30 };

// Hauteur du viewport : responsive à la fenêtre — on navigue dans le temps
// en zoomant/scrollant (molette) DANS ce cadre, comme la largeur l'était
// dans la version horizontale (le zoom ne fait pas défiler la page, il
// recadre le domaine temporel affiché).
function computeHeight() {
  // chart-wrap est toujours fixed inset:0 — la hauteur = viewport
  return window.innerHeight;
}
let height = computeHeight();

// Largeur de la colonne (tronc + arcs gauche/droite) : suit maintenant
// vraiment la largeur de #chart-wrap (qui a plus de place depuis que le
// layout donne 3/5 à la frise contre 2/5 à la sidebar) plutôt que d'être
// plafonnée à 560px — plus d'espace pour les arcs gauche/droite. Plancher
// à 280px pour ne pas déborder sur mobile, plafond large à 1400px pour
// éviter un tronc démesurément étiré sur très grand écran.
function computeWidth() {
  const raw = document.getElementById("chart-wrap").clientWidth;
  return Math.max(280, Math.min(1400, raw));
}
let width = computeWidth();
let availableArcSpace = width - margin.left - margin.right;
let LEFT_ARC_SPACE = availableArcSpace / 2;
let RIGHT_ARC_SPACE = availableArcSpace / 2;
let axisX = margin.left + LEFT_ARC_SPACE;

const svg = d3.select("#chart")
  .attr("width", width)
  .attr("height", height);

// Dégradé pour la bande "fluviale" du tronc — repassé en émeraude pour
// matcher l'accent unique du thème dark (façon Floria : une seule couleur
// d'accent sur tout le site, pas de bleu qui viendrait la concurrencer).
const defs = svg.append("defs");
const riverGradient = defs.append("linearGradient")
  .attr("id", "riverGradient")
  .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
riverGradient.append("stop").attr("offset", "0%").attr("stop-color", "#0d3b2c");
riverGradient.append("stop").attr("offset", "50%").attr("stop-color", "#34d399");
riverGradient.append("stop").attr("offset", "100%").attr("stop-color", "#0d3b2c");

// baseScale : référence fixe (domaine complet affiché à zoom dézoomé au
// maximum) mappée sur la hauteur du viewport. Bornes ajustées à la vraie
// période couverte par les évènements réels (le POC avait des données
// factices remontant à 2010). new Date(année, mois, jour) : le mois est
// indexé à partir de 0 (0 = janvier).
// yScale : la vue courante, recalculée à chaque geste de zoom/pan vertical
// via rescaleY.
const baseScale = d3.scaleTime()
  .domain([new Date(2000, 0, 1), new Date(2027, 6, 1)])
  .range([margin.top, height - margin.bottom]);
let yScale = baseScale.copy();

// extension d'arc (horizontale maintenant) proportionnelle à l'écart EN
// PIXELS À L'ÉCRAN entre les deux évènements reliés le long du tronc
// vertical (pas à l'écart calendaire brut) : s'adapte au niveau de zoom.
// .range() est recalculée à chaque render() (comme .domain()) plutôt qu'une
// fois pour toutes, car LEFT_ARC_SPACE/RIGHT_ARC_SPACE changent avec `width`
// au redimensionnement (cf. handleResize).
const arcHeightScale = d3.scaleSqrt().clamp(true);

const gBackground = svg.append("g");
const gAxis = svg.append("g");
const gGrid = svg.append("g");
const gArcs = svg.append("g");
const gNodes = svg.append("g");
const gLabels = svg.append("g");
const gTicks = svg.append("g");

const bgCatcher = gBackground.append("rect")
  .attr("class", "bg-catcher")
  .attr("x", 0).attr("y", 0)
  .attr("width", width).attr("height", height);

const tooltip = d3.select("#tooltip");

// Courbe de Bézier cubique (essai fluvial) : points de contrôle posés à
// l'horizontale de chaque extrémité, à distance h — donne une bosse
// arrondie plutôt qu'un arc géométrique strict. direction "right" bulbe
// vers la droite du tronc, "left" vers la gauche.
function arcPath(y1, y2, x, h, direction) {
  const sign = direction === "right" ? 1 : -1;
  const peak = x + sign * h;
  return `M ${x},${y1} C ${peak},${y1} ${peak},${y2} ${x},${y2}`;
}

// Filtre personne multi-sélection : INTERSECTION, pas union — un nœud reste
// visible seulement s'il concerne TOUTES les personnes sélectionnées à la
// fois (donc plus on ajoute de monde, plus ça se restreint). Un arc, lui,
// n'appartient qu'à UNE seule personne par construction (c'est le chemin de
// vie de cette personne) : il ne peut donc jamais satisfaire "toutes les
// personnes sélectionnées" dès qu'il y en a 2 ou plus — les arcs
// disparaissent naturellement au profit des nœuds collectifs qui, eux,
// peuvent effectivement concerner plusieurs personnes en même temps.
let currentFilter = new Set();
let currentTypeFilter = "";   // filtre type d'évènement (estompe les nœuds), combinable avec le précédent

function render() {
  arcHeightScale.domain([0, height]).range([10, Math.min(LEFT_ARC_SPACE, RIGHT_ARC_SPACE) - 4]);
  const [domainStart, domainEnd] = yScale.domain();
  // padding temporel autour de la fenêtre visible : on garde les arcs qui
  // entrent/sortent du cadre, mais on élague ceux dont les deux extrémités
  // sont loin hors champ (sinon ils traversent tout l'écran en grandes
  // courbes plates et parasitent la lecture du niveau de zoom courant).
  const paddingMs = (domainEnd - domainStart) * 1.5;
  const visibleStart = +domainStart - paddingMs;
  const visibleEnd = +domainEnd + paddingMs;
  const visibleArcs = allArcs.filter(a =>
    (a.from.date >= visibleStart && a.from.date <= visibleEnd) ||
    (a.to.date >= visibleStart && a.to.date <= visibleEnd)
  );

  // axe — les dates s'affichent à GAUCHE du tronc (d3.axisLeft), repoussées
  // pour laisser la place à une petite marge avant le tronc.
  const yAxis = d3.axisLeft(yScale).ticks(10).tickSizeOuter(0).tickSize(0).tickPadding(46);
  gAxis.attr("transform", `translate(${axisX}, 0)`).call(yAxis);

  // Les graduations tombant sur un 1er janvier (le formatage temporel de D3
  // y affiche déjà l'année plutôt que le mois) sont mises en avant visuellement.
  gAxis.selectAll(".tick")
    .classed("tick-year", d => +d3.timeYear.floor(d) === +d);

  // Tronc "fluvial" (essai) : une bande ondulée (dégradé) + une ligne
  // centrale qui suit la même ondulation, plutôt qu'un trait droit. Les
  // nœuds restent positionnés sur axisX (X constant) pour ne pas complexifier
  // le calcul des positions — seul le tracé décoratif du tronc ondule, il
  // "encadre" les nœuds plutôt que de les porter exactement.
  const RIVER_AMPLITUDE = 10;
  const RIVER_WAVELENGTH = 160;
  const RIVER_HALF_WIDTH = 20;
  const waveOffset = y => Math.sin(y / RIVER_WAVELENGTH) * RIVER_AMPLITUDE;
  const wavePoints = d3.range(margin.top, height - margin.bottom + 1, 12).map(y => ({ y, o: waveOffset(y) }));

  const riverArea = d3.area().curve(d3.curveBasis)
    .y(d => d.y)
    .x0(d => d.o - RIVER_HALF_WIDTH)
    .x1(d => d.o + RIVER_HALF_WIDTH);
  const riverLine = d3.line().curve(d3.curveBasis)
    .y(d => d.y)
    .x(d => d.o);

  // Ombre du tronc : 3 traits semi-transparents empilés, largeurs décroissantes
  // (un "faux flou" fait à la main), plutôt qu'un filter:blur() CSS — celui-ci
  // donnait des artefacts en forme de blocs sur un tracé aussi large/fin
  // (bug de rendu connu des filtres SVG sur certains navigateurs).
  const shadowLayers = [
    { width: 24, opacity: 0.06 },
    { width: 16, opacity: 0.10 },
    { width: 9, opacity: 0.16 }
  ];
  gAxis.selectAll(".river-shadow").data(shadowLayers).join("path")
    .attr("class", "river-shadow")
    .attr("fill", "none")
    .attr("stroke-width", d => d.width)
    .attr("stroke-opacity", d => d.opacity)
    .attr("d", riverLine)
    .each(function () { d3.select(this).lower(); });

  gAxis.selectAll(".river-band").data([wavePoints]).join("path")
    .attr("class", "river-band")
    .attr("d", riverArea)
    .lower();

  // Bande de fond, fine, centrée sur le tronc (repère visuel léger).
  // Le groupe gAxis n'est translaté qu'en X (translate(axisX, 0)), donc les
  // coordonnées Y locales sont directement les coordonnées absolues.
  gAxis.selectAll(".axis-band").data([null]).join("rect")
    .attr("class", "axis-band")
    .attr("x", -30).attr("width", 60)
    .attr("y", margin.top).attr("height", height - margin.top - margin.bottom)
    .lower();

  gAxis.selectAll(".domain-line").data([wavePoints]).join("path")
    .attr("class", "axis-line domain-line")
    .attr("fill", "none")
    .attr("d", riverLine)
    .raise();

  // repères horizontaux très légers, sur toute la largeur (à gauche ET à
  // droite du tronc maintenant que des arcs vont dans les deux sens),
  // alignés sur les graduations de dates.
  const gridTicks = yScale.ticks(10);
  gGrid.selectAll("line.grid-line").data(gridTicks, d => +d).join(
    enter => enter.append("line")
      .attr("class", "grid-line")
      .attr("y1", d => yScale(d)).attr("y2", d => yScale(d))
      .attr("x1", 10).attr("x2", width - 10)
      .attr("opacity", 0)
      .transition().duration(300).attr("opacity", 1),
    update => update
      // cf. commentaire équivalent sur nodeSel plus bas (lag pendant le
      // diaporama si on laisse une transition se relancer à chaque tick).
      .transition().duration(diaporamaState.active ? 0 : 300)
      .attr("y1", d => yScale(d)).attr("y2", d => yScale(d)),
    exit => exit.remove()
  );

  // arcs — alternés à gauche (side "left") / à droite (side "right") du
  // tronc selon la personne, pour désencombrer une frise dense.
  const arcSel = gArcs.selectAll("path.arc").data(visibleArcs, d => d.personId + d.from.id + d.to.id);

  arcSel.join(
    enter => enter.append("path")
      .attr("class", "arc")
      .attr("stroke", d => color(people.find(p => p.id === d.personId).nom))
      .attr("opacity", 0)
      .call(updateArcAttrs),
    updateSel => updateSel.call(updateArcAttrs),
    exit => exit.transition().duration(200).attr("opacity", 0).remove()
  );

  function updateArcAttrs(sel) {
    // Intersection : un arc n'appartient qu'à une seule personne, donc il ne
    // peut matcher "toutes les personnes sélectionnées" que si le filtre
    // contient exactement cette unique personne (size === 1). Dès 2
    // personnes sélectionnées, plus aucun arc ne peut satisfaire le critère
    // — comportement voulu, cf. commentaire sur `currentFilter`.
    const arcMatches = d => currentFilter.size === 1 && currentFilter.has(d.personId);
    sel
      .attr("d", d => {
        const y1 = yScale(d.from.date);
        const y2 = yScale(d.to.date);
        const h = arcHeightScale(Math.abs(y2 - y1));
        return arcPath(y1, y2, axisX, h, d.side);
      })
      .transition().duration(300)
      .attr("opacity", d => currentFilter.size === 0 ? 0.35 : (arcMatches(d) ? 1 : 0.08));

    sel
      .classed("highlighted", d => arcMatches(d))
      .classed("dimmed", d => currentFilter.size > 0 && !arcMatches(d));

    // Diaporama (cf. plans/diaporama.md) : posées après highlighted/dimmed
    // ci-dessus pour que .diaporama-current gagne même sur un arc que le
    // filtre personne assombrirait (évènement co-tagué, cf. plan).
    sel
      .classed("diaporama-upcoming", d => diaporamaUpcoming(d.to.id))
      .classed("diaporama-current", d => diaporamaIsCurrent(d.to.id));

    // Trace de l'arc courant SYNCHRONISÉE avec le déplacement de la caméra
    // (cf. plans/diaporama.md — retour : "le scroll va plus vite que le
    // trait de l'arc"). La progression (t, 0→1) suit la même horloge et le
    // même easing que la transition de zoom qui pilote yScale
    // (DIAPORAMA_TRANSITION_MS, d3.easeCubic — l'easing par défaut d3.zoom),
    // recalculée à CHAQUE frame à partir de la géométrie qu'on vient de
    // poser juste au-dessus : un stroke-dasharray figé au démarrage se
    // déformerait sous l'oeil pendant que `d` change de forme à chaque tick.
    sel.each(function (d) {
      if (!diaporamaState.active || !diaporamaIsCurrent(d.to.id)) {
        this.removeAttribute("stroke-dasharray");
        this.removeAttribute("stroke-dashoffset");
        return;
      }
      const len = this.getTotalLength();
      const t = diaporamaDrawProgress();
      this.setAttribute("stroke-dasharray", len);
      this.setAttribute("stroke-dashoffset", len * (1 - t));
    });
  }

  // nœuds (évènements) — un cercle par évènement ponctuel, taille selon le
  // nb de personnes taguées. Les évènements multi-jours (dateFin renseigné)
  // sont rendus séparément en barre verticale (cf. plus bas).
  const visibleDomain = yScale.domain();
  const visibleEvents = events.filter(e =>
    (e.date >= visibleDomain[0] && e.date <= visibleDomain[1]) ||
    (e.dateFin && e.dateFin >= visibleDomain[0] && e.date <= visibleDomain[1])
  );
  const pointEvents = visibleEvents.filter(e => !e.dateFin);
  const rangeEvents = visibleEvents.filter(e => e.dateFin);

  function nodeRadius(d) {
    // Pas de bonus de rayon ici pendant que l'arc se trace : le nœud
    // "pop" (cf. triggerDiaporamaNodePop) exactement quand le tracé
    // l'atteint, plutôt que de grossir en avance sur l'arc — retour
    // utilisateur : "le point de l'évènement arrive avec un peu de
    // retard [...] faire en sorte qu'il pop qd l'arc arrive dessus".
    return 5 + Math.min(d.personnesTaguees.length, 8) * 1.3;
  }
  function nodeFill(d) {
    return typeColor(d.type);
  }
  function nodeIsDimmed(d) {
    // Intersection : l'évènement doit taguer TOUTES les personnes du filtre
    // (pas seulement une au hasard) pour rester en avant.
    const personMismatch = currentFilter.size > 0 &&
      !Array.from(currentFilter).every(id => d.personnesTaguees.includes(id));
    const typeMismatch = currentTypeFilter && d.type !== currentTypeFilter;
    return personMismatch || typeMismatch;
  }

  const nodeSel = gNodes.selectAll("circle.event-node").data(pointEvents, d => d.id);

  nodeSel.join(
    enter => enter.append("circle")
      .attr("class", "event-node")
      .attr("r", 0)
      .attr("cx", axisX)
      .attr("cy", d => yScale(d.date))
      .attr("fill", nodeFill)
      .classed("dimmed", nodeIsDimmed)
      .classed("diaporama-upcoming", d => diaporamaUpcoming(d.id))
      .classed("diaporama-current", d => diaporamaIsCurrent(d.id))
      .on("mouseenter", (event, d) => {
        const names = d.personnesTaguees.map(id => people.find(p => p.id === id).nom).join(", ");
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.titre}</strong><br/>${d.type}<br/>${d3.timeFormat("%d/%m/%Y")(d.date)}<br/>${names}`)
          .style("left", (event.pageX + 12) + "px")
          .style("top", (event.pageY + 12) + "px");
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY + 12) + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0))
      .on("click", (event, d) => {
        event.stopPropagation();
        if (diaporamaState.active) return; // édition désactivée pendant la lecture, cf. plans/diaporama.md
        openEditPanel(d);
      })
      .transition().duration(300)
      .attr("r", nodeRadius),
    update => update
      .classed("dimmed", nodeIsDimmed)
      .classed("diaporama-upcoming", d => diaporamaUpcoming(d.id))
      .classed("diaporama-current", d => diaporamaIsCurrent(d.id))
      // Durée 0 pendant le diaporama : sinon chaque tick de la transition de
      // caméra (~60/s) interrompt et relance une transition de 300ms sur cy,
      // qui ne repart donc jamais de sa pleine vitesse — le point traîne de
      // plus en plus derrière yScale au lieu de le suivre, contrairement aux
      // arcs (positionnés par simple attr(), sans transition). Retour
      // utilisateur : "le point arrive presque une seconde en retard".
      .transition().duration(diaporamaState.active ? 0 : 300)
      .attr("cy", d => yScale(d.date))
      .attr("r", nodeRadius),
    exit => exit.transition().duration(150).attr("r", 0).remove()
  );

  // évènements multi-jours : rendus en "haltère" verticale — une ligne
  // épaisse à bouts ronds de dateDebut à dateFin (plutôt qu'une pilule),
  // reconnaissable d'un coup d'œil même collée à un gros nœud collectif.
  // Longueur mini généreuse pour ne jamais se faire avaler visuellement.
  const RANGE_MIN_LEN = 26;
  function rangeY1(d) { return yScale(d.date); }
  function rangeY2(d) {
    const y1 = yScale(d.date), y2 = yScale(d.dateFin);
    return y2 - y1 >= RANGE_MIN_LEN ? y2 : y1 + RANGE_MIN_LEN;
  }

  const rangeSel = gNodes.selectAll("line.event-node-range").data(rangeEvents, d => d.id);

  rangeSel.join(
    enter => enter.append("line")
      .attr("class", "event-node-range")
      .attr("x1", axisX).attr("x2", axisX)
      .attr("y1", rangeY1).attr("y2", rangeY1)
      .attr("stroke", nodeFill)
      .classed("dimmed", nodeIsDimmed)
      .classed("diaporama-upcoming", d => diaporamaUpcoming(d.id))
      .classed("diaporama-current", d => diaporamaIsCurrent(d.id))
      .on("mouseenter", (event, d) => {
        const names = d.personnesTaguees.map(id => people.find(p => p.id === id).nom).join(", ");
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.titre}</strong><br/>${d.type}<br/>${d3.timeFormat("%d/%m/%Y")(d.date)} → ${d3.timeFormat("%d/%m/%Y")(d.dateFin)}<br/>${names}`)
          .style("left", (event.pageX + 12) + "px")
          .style("top", (event.pageY + 12) + "px");
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY + 12) + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0))
      .on("click", (event, d) => {
        event.stopPropagation();
        if (diaporamaState.active) return;
        openEditPanel(d);
      })
      .transition().duration(300)
      .attr("y2", rangeY2),
    update => update
      .classed("dimmed", nodeIsDimmed)
      .classed("diaporama-upcoming", d => diaporamaUpcoming(d.id))
      .classed("diaporama-current", d => diaporamaIsCurrent(d.id))
      // cf. commentaire équivalent sur nodeSel plus haut.
      .transition().duration(diaporamaState.active ? 0 : 300)
      .attr("y1", rangeY1)
      .attr("y2", rangeY2),
    exit => exit.transition().duration(150).attr("y2", rangeY1).remove()
  );

  gNodes.raise();

  // labels des titres d'évènements, à DROITE du tronc — toujours affichés,
  // alignés à gauche (text-anchor: start) pour se lire naturellement de
  // gauche à droite. Anti-collision VERTICALE : si un titre est trop proche
  // du précédent dans le temps, il est repoussé un peu plus bas plutôt que
  // de se superposer (au lieu des deux rangées de la version horizontale,
  // ici c'est un décalage cumulatif en Y, plus robuste avec des largeurs de
  // texte variables). Une petite amorce relie le nœud à son label si décalé.
  const LABEL_COL_X = axisX + 22;
  const labelMinGap = 19; // agrandi avec .event-label (11px -> 13px), sinon les titres empilés se chevauchent
  let labelData = [];
  {
    let lastY = -Infinity;
    const nodeYFor = d => d.dateFin ? (yScale(d.date) + yScale(d.dateFin)) / 2 : yScale(d.date);
    [...visibleEvents].sort((a, b) => a.date - b.date).forEach(d => {
      const nodeY = nodeYFor(d);
      let y = nodeY;
      if (y - lastY < labelMinGap) y = lastY + labelMinGap;
      lastY = y;
      labelData.push({ id: d.id, titre: d.titre, nodeY, y });
    });
  }

  const labelSel = gLabels.selectAll("text.event-label").data(labelData, d => d.id);

  labelSel.join(
    enter => enter.append("text")
      .attr("class", "event-label")
      .attr("x", LABEL_COL_X)
      .attr("y", d => d.y)
      .attr("opacity", 0)
      .text(d => d.titre)
      .classed("diaporama-upcoming", d => diaporamaUpcoming(d.id))
      .classed("diaporama-current", d => diaporamaIsCurrent(d.id))
      .transition().duration(300).attr("opacity", 1),
    update => update
      .attr("y", d => d.y)
      .text(d => d.titre)
      .classed("diaporama-upcoming", d => diaporamaUpcoming(d.id))
      .classed("diaporama-current", d => diaporamaIsCurrent(d.id)),
    exit => exit.remove()
  );

  // petite amorce reliant chaque nœud à son titre — UNIQUEMENT quand le
  // label a réellement été décalé par l'anti-collision (sinon le nœud est
  // déjà juste à côté de son titre, pas besoin de trait). Avant ce filtre,
  // une amorce était dessinée pour CHAQUE évènement, toutes confinées au
  // même couloir de 14px de large : avec ~150-200 évènements ça finissait
  // par se fondre en une bande grise continue (bug constaté au test).
  const nudgedLabels = labelData.filter(d => Math.abs(d.y - d.nodeY) > 1);
  const tickSel = gTicks.selectAll("line.event-tick").data(nudgedLabels, d => d.id);

  tickSel.join(
    enter => enter.append("line")
      .attr("class", "event-tick")
      .attr("x1", axisX + 4).attr("x2", LABEL_COL_X - 4)
      .attr("y1", d => d.nodeY).attr("y2", d => d.y)
      .attr("opacity", 0)
      .transition().duration(300).attr("opacity", 1),
    update => update
      .attr("y1", d => d.nodeY).attr("y2", d => d.y),
    exit => exit.remove()
  );

  // Halo + noms diaporama (cf. plans/diaporama.md) : repositionnés à chaque
  // render() pour suivre l'évènement courant pendant que la caméra bouge
  // (yScale change à chaque frame de la transition de zoom).
  const diaporamaCurrentEvt = diaporamaCurrent();
  if (diaporamaCurrentEvt) {
    const haloY = diaporamaCurrentEvt.dateFin
      ? (yScale(diaporamaCurrentEvt.date) + yScale(diaporamaCurrentEvt.dateFin)) / 2
      : yScale(diaporamaCurrentEvt.date);
    diaporamaHalo.attr("cx", axisX).attr("cy", haloY).style("display", null);

    // Un <tspan> par ligne, 2 noms par ligne (demande explicite) — un
    // <text> SVG n'interprète pas les retours à la ligne dans son contenu,
    // il faut des <tspan>/dy successifs. Bloc vertical centré sur le halo :
    // la 1ère ligne est décalée vers le haut de la moitié de la hauteur
    // totale du bloc, chaque ligne suivante redescend d'une hauteur de ligne.
    const names = diaporamaCurrentEvt.personnesTaguees
      .map(id => people.find(p => p.id === id)?.nom)
      .filter(Boolean);
    const nameLines = [];
    for (let idx = 0; idx < names.length; idx += 2) nameLines.push(names.slice(idx, idx + 2).join(", "));
    const NAME_LINE_HEIGHT = 17; // agrandi avec .diaporama-people-name (12.5px -> 14px)

    // Décalage proportionnel au rayon du nœud courant (pas un offset fixe) :
    // un évènement avec beaucoup de personnes taguées a un nœud plus gros
    // (cf. nodeRadius), et le "pop" à l'arrivée le grossit encore d'environ
    // 35% en plus — sans ça les noms finissent collés/chevauchés contre un
    // gros nœud, cf. retour utilisateur.
    const currentRadius = diaporamaCurrentEvt.dateFin ? 10 : nodeRadius(diaporamaCurrentEvt);
    const namesX = axisX - currentRadius - 24;

    diaporamaNamesText
      .attr("x", namesX)
      .attr("y", haloY + 4)
      .style("display", null);
    diaporamaNamesText.selectAll("tspan")
      .data(nameLines)
      .join("tspan")
      .attr("x", namesX)
      .attr("dy", (d, idx) => idx === 0 ? -((nameLines.length - 1) / 2) * NAME_LINE_HEIGHT : NAME_LINE_HEIGHT)
      .text(d => d);
  } else {
    diaporamaHalo.style("display", "none");
    diaporamaNamesText.style("display", "none");
  }

  // Nettoie le "pop" (cf. triggerDiaporamaNodePop) d'un nœud qui n'est plus
  // l'évènement courant — sinon il resterait agrandi indéfiniment (la
  // classe n'est posée qu'à l'arrivée, jamais retirée ailleurs) au lieu de
  // revenir à sa taille normale d'évènement "déjà atteint".
  gNodes.selectAll("circle.event-node.diaporama-pop")
    .filter(d => !diaporamaIsCurrent(d.id))
    .classed("diaporama-pop", false);
}

/* ---------------------------------------------------------
   4) CONTRÔLES — filtres personne / type (clic sur les légendes)
--------------------------------------------------------- */

function setFilter(personId) {
  // Toggle : clic sur une personne déjà sélectionnée = la retirer du filtre,
  // clic sur une nouvelle personne = l'ajouter (multi-sélection cumulative).
  if (currentFilter.has(personId)) {
    currentFilter.delete(personId);
  } else {
    currentFilter.add(personId);
  }
  renderLegendState();
  render();
}

function setTypeFilter(type) {
  currentTypeFilter = currentTypeFilter === type ? "" : type;
  renderLegendState();
  render();
}

function renderLegendState() {
  d3.select("#legend").classed("has-active", currentFilter.size > 0);
  d3.select("#legend").selectAll(".legend-item").classed("active", d => currentFilter.has(d.id));

  d3.select("#legend-types").classed("has-active", !!currentTypeFilter);
  d3.select("#legend-types").selectAll(".legend-item").classed("active", d => d === currentTypeFilter);
}

/* ---------------------------------------------------------
   5) ZOOM MOLETTE — d3.zoom() attaché au SVG, restreint à l'axe VERTICAL.
   yScale est recalculé à chaque évènement de zoom via
   transform.rescaleY(baseScale) : zoom continu, centré sur le curseur,
   avec pan (drag) inclus nativement.
--------------------------------------------------------- */

const zoomBehavior = d3.zoom()
  .scaleExtent([1, 400])                       // 1 = vue 20 ans, 400 ≈ vue de quelques jours
  .translateExtent([[0, margin.top], [width, height - margin.bottom]])
  .extent([[0, margin.top], [width, height - margin.bottom]])
  .on("zoom", (event) => {
    yScale = event.transform.rescaleY(baseScale);
    render();
  });

svg.call(zoomBehavior);

// Calcule le transform de zoom correspondant à une fenêtre [start, end]
// donnée sur une base donnée — utilisé pour garder la même fenêtre visible
// après un redimensionnement (la hauteur du viewport a changé, donc le
// transform courant ne correspond plus à la bonne plage de dates sans
// recalcul).
function transformForDomain(start, end, base) {
  const k = (height - margin.top - margin.bottom) / (base(end) - base(start));
  const ty = margin.top - k * base(start);
  return d3.zoomIdentity.translate(0, ty).scale(k);
}

/* ---------------------------------------------------------
   6) HAUTEUR RESPONSIVE — recalcule tout ce qui dépend de `height` au
   redimensionnement de la fenêtre, en conservant la fenêtre temporelle
   actuellement affichée (pas de saut visuel).
--------------------------------------------------------- */

function handleResize() {
  const newHeight = computeHeight();
  const newWidth = computeWidth();
  if (Math.abs(newHeight - height) < 2 && Math.abs(newWidth - width) < 2) return;

  const [curStart, curEnd] = yScale.domain();
  height = newHeight;
  width = newWidth;
  availableArcSpace = width - margin.left - margin.right;
  LEFT_ARC_SPACE = availableArcSpace / 2;
  RIGHT_ARC_SPACE = availableArcSpace / 2;
  axisX = margin.left + LEFT_ARC_SPACE;

  svg.attr("width", width).attr("height", height);
  bgCatcher.attr("width", width).attr("height", height);
  baseScale.range([margin.top, height - margin.bottom]);
  zoomBehavior
    .translateExtent([[0, margin.top], [width, height - margin.bottom]])
    .extent([[0, margin.top], [width, height - margin.bottom]]);

  // Réapplique un transform de zoom équivalent sur la nouvelle hauteur pour
  // rester sur la même fenêtre de dates qu'avant le redimensionnement.
  svg.call(zoomBehavior.transform, transformForDomain(curStart, curEnd, baseScale));
}

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    handleResize();
    // Si passage mobile → desktop : remettre le panneau dans la sidebar
    if (!isMobile() && mobilePanelMoved) {
      document.getElementById("sidebar").appendChild(addPanel);
      mobilePanelMoved = false;
      const modal = document.getElementById("mobile-modal");
      modal.classList.remove("open");
      modal.classList.add("hidden");
    }
  }, 120);
});

// légende types d'évènement, cliquable : couleur + emoji + libellé, filtre les nœuds.
// (statique — indépendante de Supabase — donc peut être peuplée tout de
// suite, contrairement à la légende personnes qui attend le chargement).
d3.select("#legend-types").selectAll(".legend-item")
  .data(EVENT_TYPES)
  .join("li")
  .attr("class", "legend-item type-item")
  .style("--legend-color", d => typeColor(d))
  .style("--legend-tint", d => d3.interpolateRgb("#fff", typeColor(d))(0.18))
  .html(d => `<span class="legend-avatar">${TYPE_EMOJIS[d]}</span>${d}`)
  .on("click", (event, d) => setTypeFilter(d));

/* ---------------------------------------------------------
   7) CLIC SUR LA FRISE → PANNEAU CRÉATION / ÉDITION (Phase 5 du plan)
   - Clic sur une zone vide de la frise = position Y → date approximative
     (scale.invert), ouvre le panneau en mode création.
   - Clic sur un nœud/marqueur existant = ouvre le MÊME panneau, pré-rempli
     avec ses données actuelles, en mode édition.
   Le panneau vit en flux normal dans la sidebar (pas une popup positionnée
   au clic) : plus simple, plus prévisible, et surtout bien plus robuste sur
   mobile (pas de calcul de position ni de clavier virtuel qui recouvre une
   popup ancrée au point de tap).
--------------------------------------------------------- */

// ---- Détection mobile ----
function isMobile() { return true; } // drawer + modal toujours actifs

// ---- Drawer mobile ----
function openDrawer() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("drawer-backdrop").classList.add("visible");
}
function closeDrawer() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("drawer-backdrop").classList.remove("visible");
}
function toggleDrawer() {
  if (document.getElementById("sidebar").classList.contains("open")) {
    closeDrawer();
  } else {
    openDrawer();
  }
}
document.getElementById("drawer-toggle").addEventListener("click", toggleDrawer);
document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);

// ---- Modal full-screen pour le formulaire sur mobile ----
let mobilePanelMoved = false;

function openMobileModal() {
  const modal = document.getElementById("mobile-modal");
  const modalInner = document.getElementById("mobile-modal-inner");
  document.getElementById("mobile-modal-title").textContent = addPanelTitle.textContent;
  if (!mobilePanelMoved) {
    modalInner.appendChild(addPanel);
    mobilePanelMoved = true;
  }
  modal.classList.remove("hidden");
  modal.classList.add("open");
}

function closeMobileModal() {
  document.getElementById("mobile-modal").classList.remove("open");
}

const addPanel = document.getElementById("add-panel");
const addPanelEmpty = document.getElementById("add-panel-empty");
const addPanelTitle = document.getElementById("add-panel-title");
const addSubmitBtn = document.getElementById("add-submit");
const addDeleteBtn = document.getElementById("add-delete");
const addDateHint = document.getElementById("add-date-hint");
const addTitre = document.getElementById("add-titre");
const addType = document.getElementById("add-type");
const addPersonnesList = document.getElementById("add-personnes");
const addDate = document.getElementById("add-date");
const addDateFin = document.getElementById("add-date-fin");
const addDesc = document.getElementById("add-desc");

d3.select(addType).selectAll("option")
  .data(EVENT_TYPES)
  .join("option")
  .attr("value", d => d)
  .text(d => `${TYPE_EMOJIS[d]} ${d}`);

let pendingDate = null;
let editingEventId = null; // null = mode création, sinon id de l'évènement en cours d'édition

// Coche les personnes dont l'id est dans `ids` (Set ou tableau), décoche le reste.
function checkPeople(ids) {
  const set = ids instanceof Set ? ids : new Set(ids);
  d3.select(addPersonnesList).selectAll(".add-people-item").each(function (d) {
    const item = d3.select(this);
    const checked = set.has(d.id);
    item.select("input").property("checked", checked);
    item.classed("checked", checked);
  });
}

function showPanel() {
  if (isMobile()) {
    closeDrawer();
    openMobileModal();
  } else {
    addPanel.classList.add("open");
    addPanelEmpty.classList.add("hidden");
  }
  addTitre.focus();
}

// Mode création : clic sur une zone vide de la frise.
function openAddPanel(clickDate) {
  editingEventId = null;
  addPanelTitle.textContent = "Nouvel évènement";
  addSubmitBtn.textContent = "Créer";
  addDeleteBtn.classList.add("hidden"); // pas de suppression en mode création

  pendingDate = clickDate;
  addDateHint.textContent = "Date approximative : " + d3.timeFormat("%d/%m/%Y")(clickDate);
  addTitre.value = "";
  addType.value = EVENT_TYPES[0];
  addDate.value = d3.timeFormat("%Y-%m-%d")(clickDate);
  addDateFin.value = "";
  addDesc.value = "";

  // pré-coche les personnes actuellement filtrées, s'il y en a
  checkPeople(currentFilter);

  showPanel();
}

// Mode édition : clic sur un nœud/marqueur existant, panneau pré-rempli
// avec ses données actuelles.
function openEditPanel(evt) {
  editingEventId = evt.id;
  addPanelTitle.textContent = "Modifier l'évènement";
  addSubmitBtn.textContent = "Enregistrer";
  addDeleteBtn.classList.remove("hidden");

  addDateHint.textContent = "Évènement existant — ajuste puis enregistre";
  addTitre.value = evt.titre;
  addType.value = evt.type;
  addDate.value = d3.timeFormat("%Y-%m-%d")(evt.date);
  addDateFin.value = evt.dateFin ? d3.timeFormat("%Y-%m-%d")(evt.dateFin) : "";
  addDesc.value = evt.description || "";

  checkPeople(evt.personnesTaguees);

  showPanel();
}

function closeAddPanel() {
  if (isMobile()) {
    closeMobileModal();
  } else {
    addPanel.classList.remove("open");
    addPanelEmpty.classList.remove("hidden");
  }
  editingEventId = null;
}

bgCatcher.on("click", (event) => {
  if (diaporamaState.active) return; // création désactivée pendant le diaporama, cf. plans/diaporama.md
  const [, my] = d3.pointer(event, svg.node());
  const clickDate = yScale.invert(my);
  openAddPanel(clickDate);
});

d3.select("#add-cancel").on("click", closeAddPanel);

const loadStatus = document.getElementById("load-status");
function showStatus(message, isError) {
  loadStatus.textContent = message;
  loadStatus.classList.add("visible");
  loadStatus.classList.toggle("error", !!isError);
}
function hideStatus() {
  loadStatus.classList.remove("visible");
  loadStatus.classList.remove("error");
}

d3.select("#add-submit").on("click", async () => {
  const type = addType.value;
  const titre = addTitre.value.trim();
  if (!titre) {
    showStatus("Erreur : le titre est obligatoire.", true);
    return;
  }
  const personnesTaguees = Array.from(addPersonnesList.querySelectorAll("input:checked")).map(el => el.value);
  const date = addDate.value ? new Date(addDate.value + "T00:00:00") : pendingDate;
  const dateFin = addDateFin.value ? new Date(addDateFin.value + "T00:00:00") : undefined;
  const description = addDesc.value.trim() || undefined;

  addSubmitBtn.disabled = true;
  try {
    if (editingEventId) {
      // Édition : on met à jour l'évènement existant en base, puis on
      // remplace l'entrée locale par la version renvoyée par Supabase
      // (source de vérité — modifie_le, historique, etc. y sont recalculés
      // côté serveur, cf. scripts/schema.sql).
      const updated = await updateEvent(editingEventId, { titre, type, date, dateFin, personnesTaguees, description });
      const idx = events.findIndex(e => e.id === editingEventId);
      if (idx !== -1) events[idx] = updated;
    } else {
      // Création : l'id (uuid) est généré par Postgres, pas côté client —
      // on pousse la ligne renvoyée par Supabase dans le tableau local.
      const created = await createEvent({ titre, type, date, dateFin, personnesTaguees, description, creePar: getCurrentPersonId() });
      events.push(created);
    }

    recomputeArcs();
    closeAddPanel();
    render();
    hideStatus();
  } catch (err) {
    console.error(err);
    showStatus("Erreur : la sauvegarde a échoué, réessaie.", true);
  } finally {
    addSubmitBtn.disabled = false;
  }
});

d3.select("#add-delete").on("click", async () => {
  if (!editingEventId) return; // sécurité : bouton normalement caché en mode création
  if (!window.confirm("Supprimer définitivement cet évènement ? Cette action est irréversible.")) return;

  addDeleteBtn.disabled = true;
  try {
    await deleteEvent(editingEventId);
    events = events.filter(e => e.id !== editingEventId);
    recomputeArcs();
    closeAddPanel();
    render();
    hideStatus();
  } catch (err) {
    console.error(err);
    showStatus("Erreur : la suppression a échoué, réessaie.", true);
  } finally {
    addDeleteBtn.disabled = false;
  }
});

// Peuple les listes qui dépendent des personnes chargées depuis Supabase
// (légende + cases à cocher du panneau) — appelé une fois par boot(), et
// pas seulement à l'ouverture du panneau, pour rester en phase avec le
// filtre courant dès le premier rendu.
function renderPeopleUI() {
  d3.select("#legend").selectAll(".legend-item")
    .data(people)
    .join("li")
    .attr("class", "legend-item")
    .style("--legend-color", d => d.couleur)
    .style("--legend-tint", d => d3.interpolateRgb("#fff", d.couleur)(0.18))
    .html(d => `<span class="legend-avatar">${d.avatar}</span>${d.nom}`)
    .on("click", (event, d) => setFilter(d.id));

  // Liste de cases à cocher plutôt qu'un select simple : un évènement peut
  // taguer plusieurs personnes (cf. modèle de données), un <select>
  // mono-choix ne suffisait pas.
  d3.select(addPersonnesList).selectAll(".add-people-item")
    .data(people)
    .join("label")
    .attr("class", "add-people-item")
    .html(d => `<input type="checkbox" value="${d.id}" /><span>${d.avatar} ${d.nom}</span>`)
    .each(function () {
      const item = d3.select(this);
      const checkbox = item.select("input");
      checkbox.on("change", () => item.classed("checked", checkbox.property("checked")));
    });
}

/* ---------------------------------------------------------
   IDENTITÉ DÉCLARATIVE — écran "qui es-tu" au premier chargement +
   formulaire personne (complétion de profil / création). Pas d'auth réelle
   (cf. plans/roadmap.md) : juste un id de personne mémorisé en local pour
   préremplir `cree_par` et son propre filtre.
--------------------------------------------------------- */

const PERSON_ID_STORAGE_KEY = "arcmates:personId";
function getCurrentPersonId() {
  return localStorage.getItem(PERSON_ID_STORAGE_KEY);
}
function setCurrentPersonId(id) {
  localStorage.setItem(PERSON_ID_STORAGE_KEY, id);
}

const whoAreYouModal = document.getElementById("whoareyou-modal");
const whoAreYouList = document.getElementById("whoareyou-list");
const whoAreYouNotInList = document.getElementById("whoareyou-not-in-list");

const personModal = document.getElementById("person-modal");
const personModalTitle = document.getElementById("person-modal-title");
const personHint = document.getElementById("person-hint");
const personNom = document.getElementById("person-nom");
const personSurnoms = document.getElementById("person-surnoms");
const personEmoji = document.getElementById("person-emoji");
const personEmail = document.getElementById("person-email");
const personSubmitBtn = document.getElementById("person-submit");

// null = création ; sinon id de la personne dont on complète le profil.
let editingPersonId = null;
// true si une création réussie doit aussi devenir l'identité courante
// (repli "je ne suis pas dans la liste" du flux "qui es-tu") — false pour
// le bouton sidebar (on ajoute quelqu'un d'autre, pas soi-même).
let linkToCurrentIdentity = false;

function openPersonPanelForCompletion(person) {
  editingPersonId = person.id;
  linkToCurrentIdentity = false;
  personModalTitle.textContent = "Complète ton profil";
  personHint.textContent = "Un email pour te retrouver plus facilement (utile plus tard pour la connexion) — tu peux annuler, on te la redemandera à la prochaine visite.";
  personNom.value = person.nom;
  personNom.disabled = true;
  personSurnoms.value = (person.surnoms || []).join(", ");
  personEmoji.value = person.emoji || "";
  personEmail.value = "";
  personSubmitBtn.textContent = "Enregistrer";
  personModal.classList.remove("hidden");
}

function openPersonPanelForCreation(linkIdentity) {
  editingPersonId = null;
  linkToCurrentIdentity = linkIdentity;
  personModalTitle.textContent = "Ajouter une personne";
  personHint.textContent = "";
  personNom.value = "";
  personNom.disabled = false;
  personSurnoms.value = "";
  personEmoji.value = "";
  personEmail.value = "";
  personSubmitBtn.textContent = "Ajouter";
  personModal.classList.remove("hidden");
  personNom.focus();
}

function closePersonModal() {
  personModal.classList.add("hidden");
  editingPersonId = null;
  linkToCurrentIdentity = false;
}

function selectIdentity(person) {
  setCurrentPersonId(person.id);
  whoAreYouModal.classList.add("hidden");
  if (needsProfileCompletion(person)) {
    openPersonPanelForCompletion(person);
  }
}

function renderWhoAreYouList() {
  d3.select(whoAreYouList).selectAll("li")
    .data(people)
    .join("li")
    .attr("class", "legend-item")
    .html(d => `<span class="legend-avatar">${d.avatar}</span>${d.nom}`)
    .on("click", (event, d) => selectIdentity(d));
}

// Appelée une fois au boot : affiche "qui es-tu" si aucune identité locale
// valide n'est connue — soit rien n'a jamais été choisi, soit la personne
// choisie a depuis disparu de `people` (supprimée entretemps).
function showWhoAreYouIfNeeded() {
  if (!needsIdentitySelection(getCurrentPersonId())) return;
  renderWhoAreYouList();
  whoAreYouModal.classList.remove("hidden");
}

whoAreYouNotInList.addEventListener("click", () => openPersonPanelForCreation(true));
document.getElementById("add-person-btn").addEventListener("click", () => openPersonPanelForCreation(false));
document.getElementById("person-modal-close").addEventListener("click", closePersonModal);
document.getElementById("person-cancel").addEventListener("click", closePersonModal);

d3.select("#person-submit").on("click", async () => {
  const nom = personNom.value.trim();
  if (!nom) {
    showStatus("Erreur : le nom est obligatoire.", true);
    return;
  }
  const surnoms = personSurnoms.value.split(",").map(s => s.trim()).filter(Boolean);
  const emoji = personEmoji.value.trim() || undefined;
  const email = personEmail.value.trim() || undefined;

  personSubmitBtn.disabled = true;
  try {
    const person = editingPersonId
      ? await updatePerson(editingPersonId, { nom, surnoms, emoji, email })
      : await createPerson({ nom, surnoms, emoji, email }); // déclenche la notification admin côté base (cf. plans/roadmap.md)

    // Recharge toute la liste plutôt que de pousser juste la nouvelle ligne :
    // la palette de couleurs (buildPeople) est dimensionnée sur le nombre
    // total de personnes, donc un simple push la laisserait incohérente.
    const rawPeople = await listPeople();
    ({ people, color } = buildPeople(rawPeople));
    renderPeopleUI();

    if (linkToCurrentIdentity) setCurrentPersonId(person.id);

    closePersonModal();
    whoAreYouModal.classList.add("hidden");
    hideStatus();
  } catch (err) {
    console.error(err);
    showStatus("Erreur : l'enregistrement a échoué, réessaie.", true);
  } finally {
    personSubmitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------
   ALMANARC — bilan annuel (groupe + par personne), façon "story" (une
   slide/stat à la fois, précédent/suivant, barre de progression façon
   Stories, auto-avance) — cf. plans/almanarc.md, révisé le 2026-09-12 sur
   demande explicite ("vraiment comme le Wrapped de Spotify").
   Calcul dans data.js (availableYears/computeAlmanarcGroupe/
   computeAlmanarcPersonne) ; ici uniquement le rendu de la modale
   #almanarc-modal et ses interactions. Pas d'état persisté : rouvrir la
   modale repart de l'année civile en cours et de l'identité courante
   (cf. getCurrentPersonId).
--------------------------------------------------------- */

const ALMANARC_AUTO_ADVANCE_MS = 5000;

const almanarcBtn = document.getElementById("almanarc-btn");
const almanarcModal = document.getElementById("almanarc-modal");
const almanarcModalClose = document.getElementById("almanarc-modal-close");
const almanarcYearSelect = document.getElementById("almanarc-year");
const almanarcTabGroupeBtn = document.getElementById("almanarc-tab-groupe");
const almanarcTabPersonneBtn = document.getElementById("almanarc-tab-personne");
const almanarcViewGroupe = document.getElementById("almanarc-view-groupe");
const almanarcViewPersonne = document.getElementById("almanarc-view-personne");
const almanarcCardsGroupe = document.getElementById("almanarc-cards-groupe");
const almanarcCardsPersonne = document.getElementById("almanarc-cards-personne");
const almanarcProgressGroupe = document.getElementById("almanarc-progress-groupe");
const almanarcProgressPersonne = document.getElementById("almanarc-progress-personne");
const almanarcPersonneList = document.getElementById("almanarc-personne-list");

// Un onglet = une petite story : `slides` (tableau de { emoji, value,
// label, color }) + `index` (slide affichée). Reconstruit en bloc à
// chaque changement d'année/onglet/personne (cf. renderAlmanarcTab), pas
// mis à jour slide par slide.
const almanarcState = {
  groupe: { slides: [], index: 0 },
  personne: { slides: [], index: 0 }
};
let almanarcTab = "groupe";
// Personne affichée dans l'onglet "Par personne" ; initialisée à l'identité
// courante (getCurrentPersonId) à l'ouverture de la modale, pas ici — cf.
// openAlmanarcModal().
let selectedAlmanarcPersonId = null;
let almanarcAutoAdvanceTimer = null;

function almanarcSlide(emoji, value, label, color) {
  return { emoji, value, label, color: color || null };
}

// Slides du bilan de groupe pour une année, dans l'ordre du plan (total,
// type dominant, personne la plus active, plus grand voyageur, duo le plus
// fréquent) ; un stat non calculable (ex. aucun voyage cette année-là) saute
// juste sa slide plutôt que d'en afficher une vide. `color` teinte la slide
// (cf. --slide-color en CSS) : celle de la personne concernée, ou celle du
// type dominant — undefined pour la 1ère slide (pas de personne/type unique
// associé), qui retombe sur l'accent par défaut du thème.
function buildAlmanarcGroupeSlides(year) {
  const stats = computeAlmanarcGroupe(year);
  if (stats.totalEvents === 0) return [];

  const slides = [
    almanarcSlide("🗓️", stats.totalEvents, `évènement${stats.totalEvents > 1 ? "s" : ""} en ${year}`)
  ];
  if (stats.topType) {
    slides.push(almanarcSlide(TYPE_EMOJIS[stats.topType.type] || "🏷️", stats.topType.type, `type dominant (${stats.topType.count})`, TYPE_COLORS[stats.topType.type]));
  }
  if (stats.mostActivePerson) {
    slides.push(almanarcSlide(stats.mostActivePerson.person.avatar, stats.mostActivePerson.person.nom, `le·la plus actif·ve (${stats.mostActivePerson.count} évènement${stats.mostActivePerson.count > 1 ? "s" : ""})`, stats.mostActivePerson.person.couleur));
  }
  if (stats.topTraveler) {
    slides.push(almanarcSlide(TYPE_EMOJIS["Voyage"], stats.topTraveler.person.nom, `plus grand·e voyageur·se (${stats.topTraveler.count} voyage${stats.topTraveler.count > 1 ? "s" : ""})`, stats.topTraveler.person.couleur));
  }
  if (stats.topDuo) {
    slides.push(almanarcSlide("🤝", `${stats.topDuo.personA.nom} & ${stats.topDuo.personB.nom}`, `duo le plus fréquent (${stats.topDuo.count} évènement${stats.topDuo.count > 1 ? "s" : ""} ensemble)`, stats.topDuo.personA.couleur));
  }
  return slides;
}

// Même principe que buildAlmanarcGroupeSlides, pour le bilan d'une
// personne (total, type dominant, meilleur mate de l'année).
function buildAlmanarcPersonneSlides(personId, year) {
  const person = people.find(p => p.id === personId);
  if (!person) return [];

  const stats = computeAlmanarcPersonne(personId, year);
  if (stats.totalEvents === 0) return [];

  const slides = [
    almanarcSlide("🗓️", stats.totalEvents, `évènement${stats.totalEvents > 1 ? "s" : ""} en ${year}`, person.couleur)
  ];
  if (stats.topType) {
    slides.push(almanarcSlide(TYPE_EMOJIS[stats.topType.type] || "🏷️", stats.topType.type, `type dominant (${stats.topType.count})`, TYPE_COLORS[stats.topType.type]));
  }
  if (stats.topMate) {
    slides.push(almanarcSlide(stats.topMate.person.avatar, stats.topMate.person.nom, `meilleur mate de l'année (${stats.topMate.count} évènement${stats.topMate.count > 1 ? "s" : ""} ensemble)`, stats.topMate.person.couleur));
  }
  return slides;
}

function almanarcViewParts(view) {
  return view === "groupe"
    ? { container: almanarcCardsGroupe, progress: almanarcProgressGroupe, emptyMessage: "Rien à raconter pour cette année." }
    : { container: almanarcCardsPersonne, progress: almanarcProgressPersonne, emptyMessage: "Rien à raconter pour cette personne, cette année-là." };
}

function clearAlmanarcAutoAdvance() {
  if (almanarcAutoAdvanceTimer) {
    clearTimeout(almanarcAutoAdvanceTimer);
    almanarcAutoAdvanceTimer = null;
  }
}

// Un segment par slide : plein pour les slides déjà vues (et pour la
// dernière, affichée sans animation puisqu'il n'y a rien après) ; vide
// pour les suivantes. Le remplissage animé de la slide *courante* (hors
// dernière) est déclenché séparément par scheduleAlmanarcAutoAdvance, qui
// s'exécute juste après cet appel dans renderAlmanarcSlide.
function renderAlmanarcProgress(view) {
  const { slides, index } = almanarcState[view];
  const { progress } = almanarcViewParts(view);
  const isLast = index === slides.length - 1;
  d3.select(progress).selectAll(".almanarc-progress-segment")
    .data(slides)
    .join("div")
    .attr("class", "almanarc-progress-segment")
    .html((d, i) => `<span class="almanarc-progress-fill${i < index || (i === index && isLast) ? " filled" : ""}"></span>`);
}

function updateAlmanarcNavButtons(view) {
  const { slides, index } = almanarcState[view];
  const prevBtn = document.querySelector(`.almanarc-nav-prev[data-view="${view}"]`);
  const nextBtn = document.querySelector(`.almanarc-nav-next[data-view="${view}"]`);
  prevBtn.disabled = slides.length === 0 || index === 0;
  nextBtn.disabled = slides.length === 0 || index >= slides.length - 1;
}

// Anime le segment de la slide courante (0% -> 100% sur ALMANARC_AUTO_ADVANCE_MS)
// puis avance automatiquement — sauf sur la dernière slide, qui reste
// affichée (pas d'écran de fin type "partager", hors scope du plan) tant
// que l'utilisateur ne revient pas en arrière ou ne change pas d'année/
// onglet/personne. Un reflow forcé (offsetWidth) sépare la pose de la
// classe "active" de son état initial (width: 0%) : sans lui, le
// navigateur peut fusionner les deux changements dans le même frame et la
// barre saute directement à 100% sans transition visible.
function scheduleAlmanarcAutoAdvance(view) {
  const { slides, index } = almanarcState[view];
  if (slides.length === 0 || index >= slides.length - 1) return;

  const { progress } = almanarcViewParts(view);
  const activeFill = progress.querySelectorAll(".almanarc-progress-fill")[index];
  if (activeFill) {
    activeFill.style.transitionDuration = `${ALMANARC_AUTO_ADVANCE_MS}ms`;
    void activeFill.offsetWidth;
    activeFill.classList.add("active");
  }

  almanarcAutoAdvanceTimer = setTimeout(() => nextAlmanarcSlide(view), ALMANARC_AUTO_ADVANCE_MS);
}

// Anime un chiffre de 0 à sa valeur finale (ease-out sur ALMANARC_COUNT_UP_MS)
// façon compteur qui tourne — effet purement cosmétique, réservé aux
// valeurs numériques (le nombre total d'évènements) ; un nom/type
// (string) s'affiche directement, pas de sens à l'"animer" chiffre par
// chiffre.
const ALMANARC_COUNT_UP_MS = 650;
function animateAlmanarcValue(el, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    el.textContent = value;
    return;
  }
  const start = performance.now();
  function frame(now) {
    const progress = Math.min((now - start) / ALMANARC_COUNT_UP_MS, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(value * eased);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Petite pluie de paillettes CSS à l'arrivée d'une slide (cf. .almanarc-particle
// dans style.css) — aucun asset image, juste des <span> positionnés/animés
// en JS. Purement décoratif : si `cardEl` est absent (état vide), no-op.
function spawnAlmanarcConfetti(cardEl) {
  if (!cardEl) return;
  const count = 8;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement("span");
    particle.className = "almanarc-particle";
    particle.textContent = "✨";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 55 + Math.random() * 45;
    particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    particle.style.animationDelay = `${Math.random() * 0.12}s`;
    cardEl.appendChild(particle);
  }
}

function renderAlmanarcSlide(view) {
  const { slides, index } = almanarcState[view];
  const { container, emptyMessage } = almanarcViewParts(view);

  clearAlmanarcAutoAdvance();

  if (slides.length === 0) {
    container.innerHTML = `<p class="almanarc-empty">${emptyMessage}</p>`;
    renderAlmanarcProgress(view);
    updateAlmanarcNavButtons(view);
    return;
  }

  const slide = slides[index];
  container.innerHTML = `<div class="almanarc-card"${slide.color ? ` style="--slide-color: ${slide.color}"` : ""}><span class="almanarc-card-emoji">${slide.emoji}</span><span class="almanarc-card-value"></span><span class="almanarc-card-label">${slide.label}</span></div>`;
  const cardEl = container.querySelector(".almanarc-card");
  animateAlmanarcValue(cardEl.querySelector(".almanarc-card-value"), slide.value);
  spawnAlmanarcConfetti(cardEl);
  renderAlmanarcProgress(view);
  updateAlmanarcNavButtons(view);
  scheduleAlmanarcAutoAdvance(view);
}

function goToAlmanarcSlide(view, index) {
  const state = almanarcState[view];
  if (index < 0 || index >= state.slides.length) return;
  state.index = index;
  renderAlmanarcSlide(view);
}

function nextAlmanarcSlide(view) {
  goToAlmanarcSlide(view, almanarcState[view].index + 1);
}

function prevAlmanarcSlide(view) {
  goToAlmanarcSlide(view, almanarcState[view].index - 1);
}

// Reconstruit entièrement les slides d'un onglet (nouvelle année, nouvel
// onglet actif, ou nouvelle personne sélectionnée) et revient à la 1ère —
// contrairement à goToAlmanarcSlide, qui ne fait que naviguer dans les
// slides déjà construites.
function renderAlmanarcTab(view) {
  const year = currentAlmanarcYear();
  const state = almanarcState[view];
  state.slides = view === "groupe"
    ? buildAlmanarcGroupeSlides(year)
    : buildAlmanarcPersonneSlides(selectedAlmanarcPersonId, year);
  state.index = 0;
  renderAlmanarcSlide(view);
}

function currentAlmanarcYear() {
  return Number(almanarcYearSelect.value);
}

function setAlmanarcTab(tab) {
  almanarcTab = tab;
  almanarcTabGroupeBtn.classList.toggle("active", tab === "groupe");
  almanarcTabPersonneBtn.classList.toggle("active", tab === "personne");
  almanarcViewGroupe.classList.toggle("hidden", tab !== "groupe");
  almanarcViewPersonne.classList.toggle("hidden", tab !== "personne");
  renderAlmanarcTab(tab);
}

// Rangée horizontale façon "bulles de stories" (cf. .almanarc-people-strip
// en CSS) plutôt qu'un <select> : cohérent avec le reste de l'app qui
// affiche toujours les personnes avec leur avatar emoji, et permet de
// surligner la sélection courante (.active, même mécanique que la légende
// des filtres).
function renderAlmanarcPersonneList() {
  d3.select(almanarcPersonneList).selectAll("li")
    .data(people)
    .join("li")
    .attr("class", "legend-item")
    .classed("active", d => d.id === selectedAlmanarcPersonId)
    .style("--legend-color", d => d.couleur)
    .style("--legend-tint", d => d3.interpolateRgb("#fff", d.couleur)(0.18))
    .html(d => `<span class="legend-avatar">${d.avatar}</span>${d.nom}`)
    .on("click", (event, d) => {
      selectedAlmanarcPersonId = d.id;
      renderAlmanarcPersonneList();
      renderAlmanarcTab("personne");
    });
}

// Années proposées = celles ayant des évènements + l'année civile en cours
// (même si elle est encore vide) pour que le sélecteur ne parte jamais sur
// une année sans rapport avec "maintenant" (cf. plan, décision #5).
function populateAlmanarcYearSelect() {
  const currentYear = new Date().getFullYear();
  const years = new Set(availableYears());
  years.add(currentYear);
  const sorted = [...years].sort((a, b) => b - a);

  d3.select(almanarcYearSelect).selectAll("option")
    .data(sorted)
    .join("option")
    .attr("value", d => d)
    .text(d => d);
  almanarcYearSelect.value = String(currentYear);
}

function openAlmanarcModal() {
  populateAlmanarcYearSelect();

  const current = getCurrentPersonId();
  selectedAlmanarcPersonId = people.some(p => p.id === current)
    ? current
    : (people[0] ? people[0].id : null);

  renderAlmanarcPersonneList();
  setAlmanarcTab("groupe");
  almanarcModal.classList.remove("hidden");
}

function closeAlmanarcModal() {
  clearAlmanarcAutoAdvance();
  almanarcModal.classList.add("hidden");
}

// Navigation tactile façon Stories, deux gestes sur la même zone :
// - tap sans déplacement : moitié droite de la slide avance, gauche recule
//   (repère au pointerdown, pas besoin d'avoir bougé) ;
// - glissement horizontal net (> 40px, plus horizontal que vertical) :
//   swipe façon Stories, gauche = suivant, droite = précédent — plus
//   naturel au doigt qu'un simple tap-zone sur un écran de téléphone.
// Un seul jeu d'écouteurs pointer (couvre souris ET tactile) plutôt que
// "click" + "touchstart" séparés, pour ne pas déclencher les deux à la
// fois sur un tap. Attaché une seule fois sur le conteneur statique (pas
// sur .almanarc-card, réinjectée à chaque rendu).
function setupAlmanarcSlideGestures(container, view) {
  let startX = null;
  let startY = null;
  let dragged = false;

  container.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
    dragged = false;
  });
  container.addEventListener("pointermove", (event) => {
    if (startX === null) return;
    if (Math.abs(event.clientX - startX) > 10) dragged = true;
  });
  container.addEventListener("pointerup", (event) => {
    if (startX === null) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (dragged && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? nextAlmanarcSlide(view) : prevAlmanarcSlide(view);
    } else if (!dragged) {
      const rect = container.getBoundingClientRect();
      const clickedRight = (startX - rect.left) > rect.width / 2;
      clickedRight ? nextAlmanarcSlide(view) : prevAlmanarcSlide(view);
    }
    startX = null;
    startY = null;
  });
}
setupAlmanarcSlideGestures(almanarcCardsGroupe, "groupe");
setupAlmanarcSlideGestures(almanarcCardsPersonne, "personne");

document.querySelectorAll(".almanarc-nav-prev").forEach(btn => {
  btn.addEventListener("click", () => prevAlmanarcSlide(btn.dataset.view));
});
document.querySelectorAll(".almanarc-nav-next").forEach(btn => {
  btn.addEventListener("click", () => nextAlmanarcSlide(btn.dataset.view));
});

// Flèches clavier ↔ navigation de la slide courante, Échap ferme — actif
// uniquement modale ouverte pour ne pas interférer avec le reste de l'app
// (zoom/scroll de la frise notamment).
document.addEventListener("keydown", (event) => {
  if (almanarcModal.classList.contains("hidden")) return;
  if (event.key === "ArrowRight") nextAlmanarcSlide(almanarcTab);
  else if (event.key === "ArrowLeft") prevAlmanarcSlide(almanarcTab);
  else if (event.key === "Escape") closeAlmanarcModal();
});

almanarcBtn.addEventListener("click", openAlmanarcModal);
almanarcModalClose.addEventListener("click", closeAlmanarcModal);
almanarcTabGroupeBtn.addEventListener("click", () => setAlmanarcTab("groupe"));
almanarcTabPersonneBtn.addEventListener("click", () => setAlmanarcTab("personne"));
almanarcYearSelect.addEventListener("change", () => renderAlmanarcTab(almanarcTab));

/* ---------------------------------------------------------
   DIAPORAMA — lecture automatique de la frise, évènement par évènement,
   dans l'ordre chronologique (cf. plans/diaporama.md). Contrairement à
   l'Almanarc, pas de modale séparée : ce mode pilote directement le VRAI
   zoom D3 déjà en place (zoomBehavior/baseScale/transformForDomain plus
   haut) — chaque frame de la transition de zoom redéclenche le handler
   "zoom" existant (yScale = rescaleY; render()), donc render() n'est pas
   dupliqué, juste informé d'un état supplémentaire (diaporamaState).
--------------------------------------------------------- */

const DIAPORAMA_STEP_MS = 2600;
const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DIAPORAMA_TRANSITION_MS = REDUCED_MOTION ? 0 : 900;

const diaporamaBtn = document.getElementById("diaporama-btn");
const diaporamaBar = document.getElementById("diaporama-bar");
const diaporamaProgress = document.getElementById("diaporama-progress");
const diaporamaNowEmoji = document.getElementById("diaporama-now-emoji");
const diaporamaNowLabel = document.getElementById("diaporama-now-label");
const diaporamaNowMeta = document.getElementById("diaporama-now-meta");
const diaporamaPlayBtn = document.getElementById("diaporama-play");
const diaporamaPrevBtn = document.getElementById("diaporama-prev");
const diaporamaNextBtn = document.getElementById("diaporama-next");
const diaporamaCloseBtn = document.getElementById("diaporama-close");
const diaporamaYearFlash = document.getElementById("diaporama-year-flash");
const diaporamaYearFlashText = document.getElementById("diaporama-year-flash-text");

// Singleton : un seul halo (+ un seul texte de noms), repositionnés à
// chaque render() (pas un par évènement) — à tout instant il n'y a qu'un
// seul évènement "courant". Le texte des noms est à GAUCHE du tronc
// (ancré à droite, `text-anchor: end`), en miroir du titre déjà affiché à
// droite — demande explicite : "voir les noms des personnes qd on passe
// sur un évènement, ça pop à gauche de la timeline".
const gDiaporamaHalo = svg.append("g");
const diaporamaHalo = gDiaporamaHalo.append("circle")
  .attr("class", "diaporama-halo")
  .style("display", "none");
const diaporamaNamesText = gDiaporamaHalo.append("text")
  .attr("class", "diaporama-people-name")
  .style("display", "none");

let diaporamaState = { active: false, order: [], orderIds: new Set(), reachedIds: new Set(), index: -1, playing: false, timer: null, stepStartTime: null };

function diaporamaCurrent() {
  return diaporamaState.index >= 0 ? diaporamaState.order[diaporamaState.index] : null;
}
function diaporamaUpcoming(id) {
  return diaporamaState.active && diaporamaState.orderIds.has(id) && !diaporamaState.reachedIds.has(id);
}
function diaporamaIsCurrent(id) {
  const cur = diaporamaCurrent();
  return !!cur && cur.id === id;
}

// Centre de caméra d'un évènement : le milieu du segment pour un évènement
// multi-jours (même calcul que nodeYFor pour l'anti-collision des labels),
// sa date sinon.
function diaporamaCenterDate(evt) {
  return evt.dateFin ? new Date((evt.date.getTime() + evt.dateFin.getTime()) / 2) : evt.date;
}

// Le filtre personne/type déjà actif au moment où on ouvre le diaporama
// détermine les évènements lus (cf. plan, "Comportement") — même sémantique
// que nodeIsDimmed dans render(), dupliquée ici volontairement plutôt que
// refactorée pour ne pas toucher au chemin de filtrage déjà en place.
function diaporamaEventPassesFilter(e) {
  const personMatch = currentFilter.size === 0 || Array.from(currentFilter).every(id => e.personnesTaguees.includes(id));
  const typeMatch = !currentTypeFilter || e.type === currentTypeFilter;
  return personMatch && typeMatch;
}

// Ajuste [start, end] pour que le facteur de zoom qui en résulterait reste
// dans zoomBehavior.scaleExtent() — transformForDomain() ne clampe rien
// lui-même (le clamp du zoom molette ne s'applique qu'aux gestes
// interactifs, pas à un transform posé directement), donc deux évènements
// le même jour donneraient sinon un zoom démesuré. Le centre (`centerDate`)
// reste fixe, seule la portée de la fenêtre est resserrée/élargie.
function clampWindowToZoomExtent(centerDate, start, end, base) {
  const [minK, maxK] = zoomBehavior.scaleExtent();
  const spanPx = base(end) - base(start);
  const k = (height - margin.top - margin.bottom) / spanPx;
  if (k >= minK && k <= maxK) return { start, end };

  const clampedK = Math.max(minK, Math.min(maxK, k));
  const halfSpanPx = (height - margin.top - margin.bottom) / clampedK / 2;
  const centerPx = base(centerDate);
  return { start: base.invert(centerPx - halfSpanPx), end: base.invert(centerPx + halfSpanPx) };
}

function renderDiaporamaProgress() {
  const { order, index } = diaporamaState;
  d3.select(diaporamaProgress).selectAll(".almanarc-progress-segment")
    .data(order, d => d.id)
    .join("div")
    .attr("class", "almanarc-progress-segment")
    .html((d, i) => `<span class="almanarc-progress-fill${i < index ? " filled" : ""}"></span>`);
}

function updateDiaporamaNavButtons() {
  diaporamaPrevBtn.disabled = diaporamaState.index <= 0;
  diaporamaNextBtn.disabled = diaporamaState.index >= diaporamaState.order.length - 1;
}

function renderDiaporamaBar() {
  const current = diaporamaCurrent();
  if (!current) return;
  diaporamaNowEmoji.textContent = TYPE_EMOJIS[current.type] || "📍";
  diaporamaNowLabel.textContent = current.titre;
  const names = current.personnesTaguees
    .map(id => people.find(p => p.id === id)?.nom)
    .filter(Boolean)
    .join(", ");
  diaporamaNowMeta.textContent = `${names ? names + " · " : ""}${d3.timeFormat("%d/%m/%Y")(current.date)}`;
  renderDiaporamaProgress();
  updateDiaporamaNavButtons();
}

function flashDiaporamaYear(year) {
  if (REDUCED_MOTION) return;
  diaporamaYearFlashText.textContent = year;
  diaporamaYearFlashText.classList.remove("show");
  void diaporamaYearFlashText.offsetWidth; // force le reflow, cf. scheduleAlmanarcAutoAdvance plus haut
  diaporamaYearFlashText.classList.add("show");
}

// Rejoue l'animation d'apparition des noms (à gauche du tronc, cf. render())
// à CHAQUE étape (contrairement au flash d'année, qui ne se déclenche que
// si l'année change) — le texte lui-même est déjà repositionné/repeuplé par
// render(), cette fonction ne fait que relancer le "pop" CSS dessus.
function flashDiaporamaNames() {
  if (REDUCED_MOTION) return;
  diaporamaNamesText.classed("pop", false);
  void diaporamaNamesText.node().offsetWidth;
  diaporamaNamesText.classed("pop", true);
}

// Progression (0→1, easée) du tracé de l'arc courant depuis le début de
// l'étape — partagée entre updateArcAttrs (dans render()) et le nœud
// (cf. triggerDiaporamaNodePop) pour qu'ils restent lisibles comme UN seul
// mouvement (l'arc qui avance, puis le point qui pop en arrivant).
function diaporamaDrawProgress() {
  if (!diaporamaState.active || diaporamaState.stepStartTime === null || DIAPORAMA_TRANSITION_MS === 0) return 1;
  const raw = Math.min(1, (performance.now() - diaporamaState.stepStartTime) / DIAPORAMA_TRANSITION_MS);
  return d3.easeCubic(raw);
}

// Fait "pop" le nœud de `evt` — appelé quand le tracé de l'arc l'atteint
// (fin de la transition de caméra), pas dès le début de l'étape : retour
// utilisateur, "le point de l'évènement arrive avec un peu de retard [...]
// faire en sorte qu'il pop qd l'arc arrive dessus". `evt` peut avoir déjà
// été dépassé si l'utilisateur a enchaîné suivant/précédent avant la fin
// de la transition — dans ce cas ce pop, obsolète, est ignoré.
function triggerDiaporamaNodePop(evt) {
  if (REDUCED_MOTION || !diaporamaState.active || diaporamaCurrent() !== evt) return;
  gNodes.selectAll("circle.event-node").filter(d => d.id === evt.id).each(function () {
    const node = d3.select(this);
    node.classed("diaporama-pop", false);
    void this.getBoundingClientRect(); // force le reflow (pas d'offsetWidth sur un élément SVG)
    node.classed("diaporama-pop", true);
  });
}

function clearDiaporamaTimer() {
  clearTimeout(diaporamaState.timer);
  diaporamaState.timer = null;
}

// Anime le segment courant de la barre de progression puis avance
// automatiquement — même pattern que scheduleAlmanarcAutoAdvance (reflow
// forcé avant d'ajouter ".active" pour que la transition parte bien de 0%).
function scheduleDiaporamaAdvance() {
  clearDiaporamaTimer();
  const fills = diaporamaProgress.querySelectorAll(".almanarc-progress-fill");
  const activeFill = fills[diaporamaState.index];
  if (activeFill) {
    activeFill.style.transitionDuration = `${DIAPORAMA_STEP_MS}ms`;
    void activeFill.offsetWidth;
    activeFill.classList.add("active");
  }
  diaporamaState.timer = setTimeout(() => {
    if (diaporamaState.index >= diaporamaState.order.length - 1) { pauseDiaporama(); return; }
    goToDiaporamaStep(diaporamaState.index + 1);
  }, DIAPORAMA_STEP_MS);
}

function goToDiaporamaStep(i) {
  if (i < 0 || i >= diaporamaState.order.length) return;
  clearDiaporamaTimer();

  const previousIndex = diaporamaState.index;
  diaporamaState.index = i;
  diaporamaState.reachedIds = new Set(diaporamaState.order.slice(0, i + 1).map(e => e.id));
  diaporamaState.stepStartTime = performance.now();

  const current = diaporamaState.order[i];
  if (previousIndex >= 0) {
    const prevYear = diaporamaState.order[previousIndex].date.getFullYear();
    const curYear = current.date.getFullYear();
    if (curYear !== prevYear) flashDiaporamaYear(curYear);
  }

  render();
  renderDiaporamaBar();
  flashDiaporamaNames();

  const prevEvent = diaporamaState.order[i - 1] || null;
  const nextEvent = diaporamaState.order[i + 1] || null;
  const centerDate = diaporamaCenterDate(current);
  const timeWindow = diaporamaWindow(
    prevEvent ? diaporamaCenterDate(prevEvent) : null,
    centerDate,
    nextEvent ? diaporamaCenterDate(nextEvent) : null
  );
  const clamped = clampWindowToZoomExtent(centerDate, timeWindow.start, timeWindow.end, baseScale);

  svg.transition().duration(DIAPORAMA_TRANSITION_MS)
    .call(zoomBehavior.transform, transformForDomain(clamped.start, clamped.end, baseScale))
    .on("end", () => { render(); triggerDiaporamaNodePop(current); }); // dernière frame garantie à t=1 (tracé complet) + pop du nœud à l'arrivée

  if (diaporamaState.playing) scheduleDiaporamaAdvance();
}

function playDiaporama() {
  diaporamaState.playing = true;
  diaporamaPlayBtn.textContent = "⏸";
  diaporamaPlayBtn.setAttribute("aria-label", "Mettre en pause");
  scheduleDiaporamaAdvance();
}

function pauseDiaporama() {
  diaporamaState.playing = false;
  diaporamaPlayBtn.textContent = "▶";
  diaporamaPlayBtn.setAttribute("aria-label", "Reprendre la lecture");
  clearDiaporamaTimer();
  const fills = diaporamaProgress.querySelectorAll(".almanarc-progress-fill");
  fills[diaporamaState.index]?.classList.remove("active");
}

function nextDiaporamaStep() {
  if (diaporamaState.index < diaporamaState.order.length - 1) goToDiaporamaStep(diaporamaState.index + 1);
}
function prevDiaporamaStep() {
  if (diaporamaState.index > 0) goToDiaporamaStep(diaporamaState.index - 1);
}

function openDiaporama() {
  const order = events.filter(diaporamaEventPassesFilter).sort((a, b) => a.date - b.date);
  if (order.length === 0) return; // rien à raconter (filtre trop restrictif, ou 0 évènement) — bouton reste cliquable mais no-op

  diaporamaState = {
    active: true,
    order,
    orderIds: new Set(order.map(e => e.id)),
    reachedIds: new Set(),
    index: -1,
    playing: true,
    timer: null,
    stepStartTime: null
  };

  closeDrawer();
  diaporamaBar.classList.remove("hidden");
  diaporamaPlayBtn.textContent = "⏸";
  diaporamaPlayBtn.setAttribute("aria-label", "Mettre en pause");
  goToDiaporamaStep(0);
}

function closeDiaporama() {
  clearDiaporamaTimer();
  diaporamaState.active = false;
  diaporamaState.playing = false;
  diaporamaState.index = -1;
  diaporamaYearFlashText.classList.remove("show");
  diaporamaBar.classList.add("hidden");
  render();
}

diaporamaBtn.addEventListener("click", openDiaporama);
diaporamaCloseBtn.addEventListener("click", closeDiaporama);
diaporamaPrevBtn.addEventListener("click", prevDiaporamaStep);
diaporamaNextBtn.addEventListener("click", nextDiaporamaStep);
diaporamaPlayBtn.addEventListener("click", () => diaporamaState.playing ? pauseDiaporama() : playDiaporama());
diaporamaProgress.addEventListener("click", (event) => {
  const segment = event.target.closest(".almanarc-progress-segment");
  if (!segment) return;
  const index = Array.from(diaporamaProgress.children).indexOf(segment);
  if (index !== -1) goToDiaporamaStep(index);
});

// Flèches/Espace/Échap actifs uniquement diaporama ouvert (même garde que
// le pattern Almanarc plus haut) — écouteur séparé plutôt qu'un ajout à
// celui de l'Almanarc : les deux modes ne sont jamais actifs en même temps
// mais restent des features indépendantes.
document.addEventListener("keydown", (event) => {
  if (!diaporamaState.active) return;
  if (event.key === "ArrowRight") nextDiaporamaStep();
  else if (event.key === "ArrowLeft") prevDiaporamaStep();
  else if (event.key === " ") { event.preventDefault(); diaporamaState.playing ? pauseDiaporama() : playDiaporama(); }
  else if (event.key === "Escape") closeDiaporama();
});

// Démarrage : on attend le chargement Supabase (personnes + évènements)
// avant de peupler la légende/le panneau et de lancer le premier render() —
// tout le reste du fichier (setup D3, zoom, panneau) est indépendant des
// données et peut s'exécuter avant.
async function boot() {
  showStatus("Chargement…", false);
  try {
    await initData();
    hideStatus();
  } catch (err) {
    console.error(err);
    showStatus("Erreur de chargement — vérifie ta connexion et recharge la page.", true);
    return;
  }
  renderPeopleUI();
  showWhoAreYouIfNeeded();
  render();

  // Temps réel : les créations/modifications/suppressions faites par un
  // autre client (frise collaborative) apparaissent sans recharger la page.
  // Reçoit aussi ses propres changements (cf. storage.js) — sans effet
  // visible, applyRealtimeChange() est un upsert idempotent par id.
  subscribeToEvents((change) => {
    applyRealtimeChange(change);
    recomputeArcs();
    render();
  });
}

// Bouton fermeture modal mobile
document.getElementById("mobile-modal-close").addEventListener("click", closeAddPanel);

boot();
