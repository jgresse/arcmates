/* ---------------------------------------------------------
   3) RENDU D3 — axe VERTICAL unique + nœuds + arcs
   Dépend de data.js (people, events, allArcs, recomputeArcs,
   color, typeColor, TYPE_EMOJIS, EVENT_TYPES, pickTitleForType).

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
  return Math.max(520, window.innerHeight - 260);
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

// baseScale : référence fixe (domaine complet, calé sur la période couverte
// par les Tomes, 2011-2026) mappée sur la hauteur du viewport.
// yScale : la vue courante, recalculée à chaque geste de zoom/pan vertical
// via rescaleY.
const baseScale = d3.scaleTime()
  .domain([new Date(2010, 6, 1), new Date(2026, 6, 1)])
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
      .transition().duration(300)
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
        openEditPanel(d);
      })
      .transition().duration(300)
      .attr("r", nodeRadius),
    update => update
      .classed("dimmed", nodeIsDimmed)
      .transition().duration(300)
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
        openEditPanel(d);
      })
      .transition().duration(300)
      .attr("y2", rangeY2),
    update => update
      .classed("dimmed", nodeIsDimmed)
      .transition().duration(300)
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
  const labelMinGap = 16;
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
      .transition().duration(300).attr("opacity", 1),
    update => update
      .attr("y", d => d.y)
      .text(d => d.titre),
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
  resizeTimer = setTimeout(handleResize, 120);
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

const addPanel = document.getElementById("add-panel");
const addPanelEmpty = document.getElementById("add-panel-empty");
const addPanelTitle = document.getElementById("add-panel-title");
const addSubmitBtn = document.getElementById("add-submit");
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
  addPanel.classList.add("open");
  addPanelEmpty.classList.add("hidden");
  addTitre.focus();
}

// Mode création : clic sur une zone vide de la frise.
function openAddPanel(clickDate) {
  editingEventId = null;
  addPanelTitle.textContent = "Nouvel évènement";
  addSubmitBtn.textContent = "Créer";

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
  addPanel.classList.remove("open");
  addPanelEmpty.classList.remove("hidden");
  editingEventId = null;
}

bgCatcher.on("click", (event) => {
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
  const titre = addTitre.value.trim() || pickTitleForType(type);
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
      const created = await createEvent({ titre, type, date, dateFin, personnesTaguees, description });
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
  render();
}

boot();
