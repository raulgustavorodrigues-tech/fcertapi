import { jsPDF } from "jspdf";

type DbInfo = {
  id: string;
  name: string;
  agent_uid?: string | null;
  agent_token?: string | null;
  host?: string | null;
  port?: number | null;
  filepath?: string | null;
  username?: string | null;
  charset?: string | null;
  firebird_version?: string | null;
  sync_interval?: number | null;
  sync_tables?: string | null;
  companies?: { name?: string | null } | null;
};

const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

function slug(s: string) {
  return (s || "agente")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "agente";
}

export function generateAgentInstallPdf(db: DbInfo) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  const setBody = () => { doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(30, 30, 30); };
  const setMuted = () => { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110, 110, 110); };
  const setH1 = () => { doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(20, 20, 20); };
  const setH2 = () => { doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20, 20, 20); };
  const setMono = () => { doc.setFont("courier", "normal"); doc.setFontSize(9); doc.setTextColor(30, 30, 30); };

  function ensure(h: number) {
    if (y + h > PAGE_H - MARGIN - 10) {
      addFooter();
      doc.addPage();
      y = MARGIN;
    }
  }

  function addFooter() {
    const page = doc.getCurrentPageInfo().pageNumber;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text(`FireSync • ${db.name} • ${new Date().toLocaleString("pt-BR")}`, MARGIN, PAGE_H - 8);
    doc.text(`Página ${page}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  function h1(t: string) { setH1(); ensure(10); doc.text(t, MARGIN, y); y += 8; }
  function h2(t: string) { setH2(); ensure(9); y += 2; doc.text(t, MARGIN, y); y += 6;
    doc.setDrawColor(220); doc.line(MARGIN, y - 3, MARGIN + CONTENT_W, y - 3);
  }
  function p(t: string) {
    setBody();
    const lines = doc.splitTextToSize(t, CONTENT_W);
    ensure(lines.length * 5 + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 1;
  }
  function muted(t: string) {
    setMuted();
    const lines = doc.splitTextToSize(t, CONTENT_W);
    ensure(lines.length * 4.5 + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.5 + 1;
  }
  function step(n: number, title: string, body: string) {
    setH2(); doc.setFontSize(11);
    ensure(8);
    doc.setFillColor(230, 82, 44);
    doc.circle(MARGIN + 3.5, y - 1.5, 3.5, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(10);
    doc.text(String(n), MARGIN + 3.5, y + 0.2, { align: "center" });
    doc.setTextColor(20, 20, 20); doc.setFontSize(11);
    doc.text(title, MARGIN + 10, y);
    y += 5;
    p(body);
    y += 1;
  }
  function code(text: string) {
    setMono();
    const lines = doc.splitTextToSize(text, CONTENT_W - 6);
    const h = lines.length * 4.2 + 4;
    ensure(h);
    doc.setFillColor(245, 245, 247);
    doc.setDrawColor(225);
    doc.roundedRect(MARGIN, y - 3, CONTENT_W, h, 1.5, 1.5, "FD");
    doc.setTextColor(30, 30, 30);
    doc.text(lines, MARGIN + 3, y + 1);
    y += h;
  }
  function kv(rows: [string, string][]) {
    const rowH = 6;
    ensure(rows.length * rowH + 2);
    rows.forEach(([k, v], i) => {
      const yy = y + i * rowH;
      if (i % 2 === 0) { doc.setFillColor(248, 248, 250); doc.rect(MARGIN, yy - 4, CONTENT_W, rowH, "F"); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
      doc.text(k, MARGIN + 2, yy);
      doc.setFont("courier", "normal"); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
      const val = doc.splitTextToSize(v || "—", CONTENT_W - 55);
      doc.text(val[0] ?? "—", MARGIN + 50, yy);
    });
    y += rows.length * rowH + 2;
  }

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("FireSync LocalBridge", MARGIN, 12);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Guia de instalação do agente Windows", MARGIN, 19);
  doc.setFontSize(8); doc.setTextColor(200, 200, 210);
  doc.text(new Date().toLocaleDateString("pt-BR"), PAGE_W - MARGIN, 12, { align: "right" });
  y = 36;

  h1(db.name);
  muted(`Empresa: ${db.companies?.name ?? "—"}   •   Agent UID: ${db.agent_uid ?? "—"}`);
  y += 3;

  h2("Dados do banco");
  kv([
    ["Empresa", db.companies?.name ?? "—"],
    ["Banco", db.name],
    ["Host / Porta", `${db.host ?? "localhost"}:${db.port ?? 3050}`],
    ["Arquivo .FDB", db.filepath ?? "—"],
    ["Usuário", db.username ?? "SYSDBA"],
    ["Firebird / Charset", `${db.firebird_version ?? "2.5"} · ${db.charset ?? "WIN1252"}`],
    ["Intervalo de sync", `${db.sync_interval ?? 900}s`],
    ["Tabelas", db.sync_tables ?? "ALL"],
  ]);

  h2("O que é o agente");
  p("O FireSync Agent é um serviço Windows leve instalado na máquina/servidor onde roda o Firebird. Ele mantém uma conexão HTTPS de saída com o Hub — não exige IP fixo, não abre porta no roteador e não precisa de VPN. Toda a comunicação é iniciada de dentro para fora.");

  h2("Pré-requisitos");
  p("• Windows 10/11 ou Windows Server (64-bit)\n• Firebird 2.5 / 3.0 / 4.0 acessível localmente\n• Conta com privilégios de Administrador\n• Acesso à internet de saída (HTTPS/443)");

  h2("Passo a passo");
  step(1, "Baixar o pacote de instalação", 'No Hub, na tela "Bancos", localize este banco (' + db.name + ') e clique em "Instalador Windows". Um arquivo .ZIP será baixado contendo install.bat, firesync-agent.env e o LEIA-ME.');
  step(2, "Extrair o ZIP no servidor do cliente", "Copie o .ZIP para o computador onde o Firebird roda e extraia todo o conteúdo em uma pasta (ex.: C:\\FireSync\\instalador). Mantenha os três arquivos juntos.");
  step(3, "Executar install.bat como Administrador", 'Clique com o botão direito em install.bat e escolha "Executar como administrador". O script vai: (a) baixar o instalador oficial do agente, (b) instalar em C:\\Program Files\\FireSync\\, (c) registrar o serviço Windows "FireSyncAgent" com start automático, (d) iniciá-lo.');
  step(4, "Validar o serviço", 'Ao final, o próprio script confere se o serviço está RUNNING. Você também pode abrir um Prompt como Admin e rodar: sc query FireSyncAgent');
  step(5, "Confirmar comunicação no Hub", 'Volte ao Hub, atualize a tela "Bancos" e verifique se o card deste banco mostra o selo verde (Push only / Tunnel ativo) e um heartbeat recente. Em seguida, clique em "Testar" para executar um ping real via agente.');
  step(6, "(Opcional) Rodar o Probe de diagnóstico", 'Se algo falhar, baixe o botão "Probe" na tela do banco. Ele é um utilitário somente leitura que valida caminho do .FDB, credenciais e conectividade sem instalar nada.');

  h2("Configuração incluída no ZIP (firesync-agent.env)");
  muted("Este arquivo já vem pré-preenchido pelo Hub — você não precisa editar manualmente. Está aqui apenas para referência e conferência.");
  const envText = [
    `REMOTE_ENDPOINT=${origin}/api/public/sync`,
    `HEARTBEAT_ENDPOINT=${origin}/api/public/heartbeat`,
    `COMMAND_RESULT_ENDPOINT=${origin}/api/public/command_result`,
    `REGISTER_ENDPOINT=${origin}/api/public/register`,
    "",
    `API_TOKEN=${db.agent_token ?? "<gere no cadastro do banco>"}`,
    `AGENT_UID=${db.agent_uid ?? ""}`,
    `AGENT_ALIAS=${db.name}`,
    "",
    `DB_TYPE=firebird`,
    `DB_HOST=${db.host ?? "localhost"}`,
    `DB_PORT=${db.port ?? 3050}`,
    `DB_PATH=${db.filepath ?? ""}`,
    `DB_USER=${db.username ?? "SYSDBA"}`,
    `DB_CHARSET=${db.charset ?? "WIN1252"}`,
    `DB_FIREBIRD_VERSION=${db.firebird_version ?? "2.5"}`,
    "",
    `SYNC_INTERVAL=${db.sync_interval ?? 900}`,
    `SYNC_TABLES=${db.sync_tables ?? "ALL"}`,
  ].join("\n");
  code(envText);

  h2("Comandos úteis (Prompt como Administrador)");
  code([
    ":: status do serviço",
    "sc query FireSyncAgent",
    "",
    ":: reiniciar após alterar o .env",
    "sc stop  FireSyncAgent",
    "sc start FireSyncAgent",
    "",
    ":: log do agente",
    'type "C:\\ProgramData\\FireSync\\logs\\firesync-agent.log"',
  ].join("\n"));

  h2("Solução de problemas");
  p("• Card fica \"Offline\" no Hub → confira se o serviço está RUNNING e se a máquina tem internet de saída.\n• Erro de autenticação no Firebird → revise DB_USER/DB_PASS no .env e reinicie o serviço.\n• Arquivo .FDB não encontrado → o caminho é lido do ponto de vista da máquina onde o agente roda; ajuste DB_PATH.\n• Token inválido → gere um novo token no cadastro do banco e baixe o instalador novamente.");

  h2("Desinstalação");
  p("Painel de Controle → Programas → \"FireSync LocalBridge Agent\" → Desinstalar. O serviço é removido automaticamente.");

  addFooter();
  doc.save(`firesync-instalacao-${slug(db.companies?.name ?? "")}-${slug(db.name)}.pdf`);
}
