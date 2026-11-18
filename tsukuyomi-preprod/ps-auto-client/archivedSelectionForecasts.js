// Recorded individual probabilities from the PS-AUTO dashboard snapshot.
// PSF_TICKET_PROBS, n3 and ZTicketRunnerMap tie them to exact ticket selections.
// https://lfaraon.github.io/PS-AUTO/assets/index-Settlement-tickets-20261117-platformfix-v4.js
export const archivedSelectionForecasts = new Map([
  ["LORO-2026-11-07-T002", [
    ["Paris Saint-Germain – Troyes", "Paris Saint-Germain Under3.5 buts (équipe)", 91.8],
  ]],
  ["LORO-2026-11-08-T002", [
    ["AIK – Häcken", "AIK ou nul (double chance)", 57.1],
    ["Estrela – Benfica", "Benfica Under3.5 buts (équipe)", 84.2],
    ["Goiás – Ponte Preta", "Goiás Under3.5 buts (équipe)", 91.1],
  ]],
  ["LORO-2026-11-09-T001", [
    ["Torreense – UD Leiria", "Torreense Under2.5 buts (équipe)", 87.5],
  ]],
  ["LORO-2026-11-10-T001", [
    ["Alex Michelsen – Juan Manuel Cerundolo", "Alex Michelsen vainqueur", 66],
    // Run C9F8, event 89402, data_freeze.json from 2026-11-10T01:49:46.459Z.
    // Romero +1.5 sets wins in every state except Monnet 2–0 (18%).
    ["Carole Monnet – Leyre Romero Gormaz", "Leyre Romero Gormaz +1.5 sets", 82],
    ["Bianca Andreescu – Rebeka Masarova", "Bianca Andreescu vainqueure", 64],
  ]],
  ["LORO-2026-11-11-T001", [
    ["Juventus F – Lyon F", "Juventus F – Lyon F Under4.5 buts (match)", 85.247],
  ]],
  ["LORO-2026-11-12-T001", [
    ["Bénin – Centrafrique", "Bénin Under2.5 buts (équipe)", 79.4],
    ["Sénégal – Soudan", "Sénégal Under3.5 buts (équipe)", 91.8],
    ["Angleterre – Croatie", "Angleterre Under3.5 buts (équipe)", 82.7],
  ]],
  ["LORO-2026-11-12-T002", [
    ["Monténégro – Lettonie", "Monténégro Under3.5 buts (équipe)", 90.1],
  ]],
  ["LORO-2026-11-13-T001", [
    ["Écosse – Macédoine du Nord", "Écosse – Macédoine du Nord Under4.5 buts (match)", 91.6],
    ["Luxembourg – Estonie", "Luxembourg – Estonie Under3.5 buts (match)", 93.7],
  ]],
  ["LORO-2026-11-14-T001", [
    ["Géorgie – Hongrie", "Géorgie Under1.5 buts (équipe)", 97.4],
    ["Atlético Goianiense – Cuiabá", "Atlético Goianiense Under2.5 buts (équipe)", 87.9],
    ["Irlande du Nord – Ukraine", "Ukraine Under1.5 buts (équipe)", 97.4],
  ]],
  ["LORO-2026-11-16-T001", [
    ["Estonie – Bulgarie", "Bulgarie +2.0 (handicap 1X2)", 89.1],
    ["Albacete Balompié – Celta Vigo B", "Albacete Balompié moins de 2.5 buts (équipe)", 87.5],
    ["Grèce – Serbie", "Serbie +3.0 (handicap 1X2)", 93.2],
  ]],
  // Exact ticket mappings in n3 and ZTicketRunnerMap, in the played-ticket order.
  ["PSF-2026-11-07-T002", [
    ["Sporting CP – Moreirense FC", "Moreirense FC +3.5 (handicap buts)", 94.7],
    ["Paris Saint-Germain – ESTAC Troyes", "Paris Saint-Germain : moins de 4,5 buts", 97.5],
  ]],
  ["PSF-2026-11-08-T001", [
    ["Tromsoe IL – Bodoe/Glimt", "Bodoe/Glimt : moins de 3,5 buts", 94.4],
    ["HJK Helsinki – AC Oulu", "AC Oulu +3.5 (handicap buts)", 95.5],
  ]],
  ["PSF-2026-11-08-T002", [
    ["Estrela Amadora – SL Benfica", "SL Benfica : moins de 4,5 buts", 94],
    ["Goias EC GO – AA Ponte Preta SP", "AA Ponte Preta SP +3.5 (handicap buts)", 94.3],
  ]],
  ["LORO-2026-11-08-T001", [
    ["Brighton – Brentford", "Brighton ou nul (double chance)", 84.9],
    ["Sunderland – Chelsea", "Chelsea Under2.5 buts (équipe)", 85.5],
  ]],
  ["PSF-2026-11-09-T001", [
    ["Kristiansund BK – Vålerenga IF", "Kristiansund BK +1.5", 82.9],
    ["SCU Torreense – UD Leiria", "SCU Torreense moins de2.5 buts", 87.5],
  ]],
  ["PSF-2026-11-11-T001", [
    ["Aryna Sabalenka – Mirra Andreeva", "Sabalenka +1.5 sets", 87],
    ["Vietnam – Chinese Taipei", "Chinese Taipei +4.5 asian", 96.5],
  ]],
  ["PSF-2026-11-12-T002", [
    ["Montenegro–Latvia", "Montenegro – moins de 3.5 buts équipe", 89.9],
    ["England–Croatia", "England–Croatia moins de 4.5 buts", 84.5],
    ["Turkiye–Belgium", "Turkiye–Belgium moins de 4.5 buts", 86.7],
  ]],
  ["PSF-2026-11-13-T003", [
    ["Scotland–North Macedonia", "Scotland–North Macedonia under4.5", 91.6],
    ["Luxembourg–Estonia", "Luxembourg–Estonia under3.5", 93.7],
    ["Serbia–Germany", "Serbia +2.5 handicap asiatique", 88.3],
  ]],
  ["PSF-2026-11-14-T004", [
    ["Georgia–Hungary", "Georgia Under1.5 goals", 97.4],
    ["Atletico-GO–Cuiabá", "Cuiabá +2.5", 92.7],
    ["Northern Ireland–Ukraine", "Ukraine Under1.5 goals", 97.4],
  ]],
  ["PSF-2026-11-16-T001", [
    ["Estonie – Bulgarie", "Bulgarie +1.5 (handicap asiatique)", 89.1],
    ["Grèce – Serbie", "Serbie +2.5 (handicap asiatique)", 93.2],
    ["Albacete Balompié – Celta Vigo B", "Albacete Balompié moins de 2.5 buts (équipe)", 87.5],
  ]],
]);
