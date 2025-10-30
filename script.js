// VARIÁVEIS GLOBAIS
var tabela;
var mesFiltro;
var anoFiltro;
var dataRange = {min: null, max: null};
var modalDevedorInstance;
var todosOsDados = []; // Guarda todos os dados do CSV

// Índices das colunas
const INDICES = {
    SEL: 0, DATA_MOVIMENTO: 1, BANCO: 2, OPERACAO: 3, DOCUMENTO: 4,
    NEGOCIADOR: 5, PROCESSO: 6, CLIENTE: 7, DEVEDOR: 8, DEPOSITO: 9,
    BA: 10, PARCELA: 11, DESPESA: 12, HD: 13, HC: 14, REPASSE: 15,
    COMISSAO: 16, COLUNA1: 17
};

// ====================================================================
// FUNÇÕES DE UTILIDADE (Moeda)
// ====================================================================
function formatarMoeda(valor) {
    if (isNaN(valor) || valor === null) return "R$ 0,00";
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function parseMoeda(stringValor) {
    if (!stringValor || typeof stringValor !== 'string') return 0;
    let valorLimpo = stringValor.replace(/R\$\s?|(\.)/g, '').replace(',', '.');
    let valor = parseFloat(valorLimpo);
    return isNaN(valor) ? 0 : valor;
}

// ====================================================================
// FUNÇÃO DE UTILIDADE (Data)
// ====================================================================
function converterDataBrasileira(dataStr) {
    if (!dataStr) return '';
    var partes = dataStr.trim().split('/');
    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`; // AAAA-MM-DD
    return dataStr.trim();
}

function formatarDataParaExibicao(dataStr) {
    if (!dataStr) return '';
    var partes = dataStr.split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`; // DD/MM/AAAA
    return dataStr;
}

// ====================================================================
// FUNÇÃO PARA POPULAR OS SELECTS (MOVIDA PARA O ESCOPO GLOBAL)
// ====================================================================
function popularSelects(coluna, seletor) {
    var select = $(seletor);
    select.empty();
    select.append('<option value="">— Todos —</option>');
    coluna.data().unique().sort().each(function (d, j) {
        if (d && d.trim() !== '') {
            var valor = d.trim();
            select.append('<option value="' + valor + '">' + valor + '</option>');
        }
    });
}

// ====================================================================
// PLUGIN: ORDENAÇÃO DE DATA (dd/mm/aaaa)
// ====================================================================
$.extend($.fn.dataTable.ext.type.order, {
    "date-br-pre": function (d) {
        if (!d) return 0;
        var partes = d.split('/');
        if (partes.length === 3) return partes[2] + partes[1] + partes[0];
        partes = d.split('-');
        if (partes.length === 3) return partes[0] + partes[1] + partes[2];
        return 0;
    },
    "date-br-asc": (a, b) => a - b,
    "date-br-desc": (a, b) => b - a
});

// ====================================================================
// FILTROS DE DATATABLES
// ====================================================================
$.fn.dataTable.ext.search.push(
    function( settings, data, dataIndex ) {
        if ( settings.nTable.id !== 'tabelaDados' ) return true; 
        var dataMovimento = data[INDICES.DATA_MOVIMENTO]; // AAAA-MM-DD
        if (mesFiltro !== undefined && anoFiltro !== undefined) {
            var partesData = dataMovimento.split('-');
            if (partesData.length !== 3) return false;
            var linhaAno = parseInt(partesData[0]);
            var linhaMes = parseInt(partesData[1]);
            return linhaMes === mesFiltro && linhaAno === anoFiltro;
        }
        return true;
    }
);
$.fn.dataTable.ext.search.push(
    function( settings, data, dataIndex ) {
        if (settings.nTable.id !== 'tabelaDados' || (!dataRange.min && !dataRange.max)) return true;
        var dataTabela = data[INDICES.DATA_MOVIMENTO]; 
        var dateT = new Date(dataTabela + 'T00:00:00').getTime();
        if (isNaN(dateT)) return true; 
        var min = dataRange.min ? dataRange.min.getTime() : null;
        var max = dataRange.max ? dataRange.max.getTime() : null;
        return (min === null && max === null) || (min === null && dateT <= max) || (min <= dateT && max === null) || (min <= dateT && dateT <= max);
    }
);

// ====================================================================
// FUNÇÃO DE CÁLCULO DE TENDÊNCIA
// ====================================================================
function calcularPercentualMudanca(atual, anterior) {
    if (anterior === 0) {
        if (atual > 0) return `<span class="trend-up"><i class="fas fa-arrow-up"></i> Novo</span>`;
        return `<span class="trend-neutral">--</span>`;
    }
    const mudanca = ((atual - anterior) / anterior) * 100;
    if (mudanca > 0) return `<span class="trend-up"><i class="fas fa-arrow-up"></i> ${mudanca.toFixed(1)}%</span>`;
    else if (mudanca < 0) return `<span class="trend-down"><i class="fas fa-arrow-down"></i> ${mudanca.toFixed(1)}%</span>`;
    else return `<span class="trend-neutral">0.0%</span>`;
}

// ====================================================================
// FUNÇÃO PARA ATUALIZAR KPIs (Com Tendência)
// ====================================================================
function atualizarKPIs(dados) {
    let totais = {
        depositos: 0, comissao: 0, acordos: 0,
        depositosAnterior: 0, comissaoAnterior: 0, acordosAnterior: 0
    };
    
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1; // 1-12
    const anoAtual = hoje.getFullYear();
    let mesAnterior = (mesAtual === 1) ? 12 : mesAtual - 1;
    let anoAnterior = (mesAtual === 1) ? anoAtual - 1 : anoAtual;

    dados.forEach(row => {
        const dataLinha = row[INDICES.DATA_MOVIMENTO]; 
        if (!dataLinha) return; 
        const partesData = dataLinha.split('-');
        const linhaAno = parseInt(partesData[0]);
        const linhaMes = parseInt(partesData[1]);
        let comissaoLinha = row[INDICES.HD] + row[INDICES.HC];

        if (linhaAno === anoAtual && linhaMes === mesAtual) {
            totais.depositos += row[INDICES.DEPOSITO];
            totais.comissao += comissaoLinha;
            totais.acordos++;
        }
        else if (linhaAno === anoAnterior && linhaMes === mesAnterior) {
            totais.depositosAnterior += row[INDICES.DEPOSITO];
            totais.comissaoAnterior += comissaoLinha;
            totais.acordosAnterior++;
        }
    });

    let ticketMedio = (totais.acordos > 0) ? (totais.depositos / totais.acordos) : 0;
    let ticketMedioAnterior = (totais.acordosAnterior > 0) ? (totais.depositosAnterior / totais.acordosAnterior) : 0;

    $('#kpiTotalDepositos').text(formatarMoeda(totais.depositos));
    $('#kpiTotalComissao').text(formatarMoeda(totais.comissao));
    $('#kpiTotalAcordos').text(totais.acordos);
    $('#kpiTicketMedio').text(formatarMoeda(ticketMedio));
    $('#kpiTrendDepositos').html(calcularPercentualMudanca(totais.depositos, totais.depositosAnterior));
    $('#kpiTrendComissao').html(calcularPercentualMudanca(totais.comissao, totais.comissaoAnterior));
    $('#kpiTrendAcordos').html(calcularPercentualMudanca(totais.acordos, totais.acordosAnterior));
    $('#kpiTrendTicketMedio').html(calcularPercentualMudanca(ticketMedio, ticketMedioAnterior));
}

// ====================================================================
// FUNÇÃO PARA PROCESSAR OS DADOS (reutilizável)
// ====================================================================
function processarDados(results) {
    var dadosBrutos = results.data;
    var dadosParaDataTable = dadosBrutos.slice(1);
    
    todosOsDados = dadosParaDataTable.map(row => {
        var novaLinha = [...row];
        if (novaLinha.length !== 18) { while(novaLinha.length < 18) { novaLinha.push(''); } }
        
        novaLinha[INDICES.DATA_MOVIMENTO] = converterDataBrasileira(novaLinha[INDICES.DATA_MOVIMENTO]);
        novaLinha[INDICES.DEPOSITO] = parseMoeda(novaLinha[INDICES.DEPOSITO]);
        novaLinha[INDICES.DESPESA] = parseMoeda(novaLinha[INDICES.DESPESA]);
        novaLinha[INDICES.HD] = parseMoeda(novaLinha[INDICES.HD]);
        novaLinha[INDICES.HC] = parseMoeda(novaLinha[INDICES.HC]);
        novaLinha[INDICES.REPASSE] = parseMoeda(novaLinha[INDICES.REPASSE]);
        return novaLinha;
    }).filter(row => row[INDICES.DATA_MOVIMENTO] && row[INDICES.DATA_MOVIMENTO].trim() !== '');
    
    tabela.clear().rows.add(todosOsDados).draw();
    
    // AGORA ESTA CHAMADA FUNCIONA!
    popularSelects(tabela.column(INDICES.NEGOCIADOR), '#filtroNegociador');
    popularSelects(tabela.column(INDICES.CLIENTE), '#filtroCliente');
    
    // --- ATUALIZA A UI ---
    $('#loading-block').hide(); // Esconde o spinner
    $('#main-app-content').show(); // Mostra o app (KPIs, Filtros, Tabela)
    $('#filtroAtivoMensagem').text('Filtro automático de mês ATIVO: Exibindo dados de ' + mesFiltro + '/' + anoFiltro);
    
    // Atualiza os KPIs
    atualizarKPIs(todosOsDados);
}


// ====================================================================
// FUNÇÃO PRINCIPAL (DOCUMENT READY)
// ====================================================================
$(document).ready(function() {
    
    var hoje = new Date();
    mesFiltro = hoje.getMonth() + 1;
    anoFiltro = hoje.getFullYear();
    modalDevedorInstance = new bootstrap.Modal(document.getElementById('modalDevedor'));

    $('#triggerCsvUpload').on('click', function(e) {
        e.preventDefault();
        $('#csvFile').click(); 
    });

    // ----------------------------------------------------
    // INICIALIZAÇÃO DA TABELA
    // ----------------------------------------------------
    tabela = $('#tabelaDados').DataTable({
        "searching": true,
        "language": { "url": "https://cdn.datatables.net/plug-ins/2.0.8/i18n/pt-BR.json" },
        "dom": '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>><"row"<"col-sm-12"tr>><"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
        "orderMulti": true, "paging": true, "destroy": true, "processing": true, "serverSide": false,
        "order": [[INDICES.DATA_MOVIMENTO, 'desc']],
        "columnDefs": [
            { 
                "targets": [ 
                    INDICES.SEL, INDICES.BANCO, INDICES.OPERACAO, INDICES.NEGOCIADOR, 
                    INDICES.PROCESSO, INDICES.BA, INDICES.PARCELA, INDICES.DESPESA, 
                    INDICES.HD, INDICES.HC, INDICES.REPASSE, INDICES.COMISSAO, INDICES.COLUNA1 
                ], 
                "visible": false 
            },
            { 
                "targets": [ 
                    INDICES.DATA_MOVIMENTO, INDICES.DOCUMENTO, INDICES.CLIENTE, 
                    INDICES.DEVEDOR, INDICES.DEPOSITO 
                ], 
                "visible": true 
            },
            { "targets": INDICES.DATA_MOVIMENTO, "type": "date-br", "render": (data, type) => (type === 'display') ? formatarDataParaExibicao(data) : data },
            { "targets": INDICES.DEPOSITO, "className": "coluna-moeda", "render": (data) => formatarMoeda(data) }
        ],
        "footerCallback": function(row, data, start, end, display) {
            var api = this.api();
            const sumColumn = (index) => api.column(index, { search: 'applied' }).data().reduce((a, b) => a + (Number(b) || 0), 0);
            var totalDeposito = sumColumn(INDICES.DEPOSITO);
            var footer = $(api.table().footer());
            footer.find('#totalDeposito').html(formatarMoeda(totalDeposito));
        }
    });
    
    // ----------------------------------------------------
    // ATUALIZADO: LEITURA DO CSV (Fetch Automático)
    // ----------------------------------------------------
    $('#main-app-content').hide();
    $('#upload-block').hide(); 
    $('#loading-block').show(); 

    fetch('dados.csv') // <--- NOME DO SEU ARQUIVO AQUI
        .then(response => {
            if (!response.ok) {
                throw new Error("Rede não respondeu, ou arquivo 'dados.csv' não encontrado.");
            }
            return response.text();
        })
        .then(csvText => {
            Papa.parse(csvText, {
                header: false, delimiter: ';', dynamicTyping: false, skipEmptyLines: true,
                encoding: "Windows-1252", 
                complete: function(results) {
                    processarDados(results);
                }
            });
        })
        .catch(error => {
            console.error("Erro ao carregar 'dados.csv' automaticamente:", error);
            $('#loading-block').hide();
            $('#upload-block').show(); 
            $('#statusMensagem').text("Erro ao carregar automático. Use o upload manual.");
        });

    // ----------------------------------------------------
    // Upload manual (ainda funciona como fallback e pelo menu)
    // ----------------------------------------------------
    $('#csvFile').on('change', function(event) {
        var file = event.target.files[0];
        if (file) {
            $('#upload-block').hide();
            $('#loading-block').show();
            $('#statusMensagem').text('Carregando e processando dados...');
            
            Papa.parse(file, {
                header: false, delimiter: ';', dynamicTyping: false, skipEmptyLines: true,
                encoding: "Windows-1252", 
                complete: function(results) {
                    processarDados(results);
                }
            });
        }
    });


    // ----------------------------------------------------
    // APLICAR FILTROS (Botão Consultar)
    // ----------------------------------------------------
    $('#btnConsultar').on('click', function() {
        mesFiltro = undefined;
        anoFiltro = undefined;
        $('#filtroAtivoMensagem').removeClass('alert-info').addClass('alert-secondary').text('Filtro de Mês Desativado. Use os filtros acima.');

        tabela.column(INDICES.NEGOCIADOR).search($('#filtroNegociador').val() ? '^' + $.fn.dataTable.util.escapeRegex($('#filtroNegociador').val()) + '$' : '', true, false);
        tabela.column(INDICES.CLIENTE).search($('#filtroCliente').val() ? '^' + $.fn.dataTable.util.escapeRegex($('#filtroCliente').val()) + '$' : '', true, false);
        tabela.search($('#filtroBuscaGeral').val());

        var dataInicio = $('#dataInicio').val();
        var dataFim = $('#dataFim').val();
        dataRange.min = dataInicio ? new Date(dataInicio + 'T00:00:00') : null;
        dataRange.max = dataFim ? new Date(dataFim + 'T23:59:59') : null;
        
        tabela.draw();
    });

    // ----------------------------------------------------
    // LIMPAR FILTROS
    // ----------------------------------------------------
    $('#limparFiltrosExternos').on('click', function() {
        $('.filtro-select').val('');
        $('#filtroBuscaGeral').val('');
        $('#dataInicio').val('');
        $('#dataFim').val('');
        dataRange.min = null;
        dataRange.max = null;
        tabela.columns().search('');
        tabela.search('');

        var hoje = new Date();
        mesFiltro = hoje.getMonth() + 1;
        anoFiltro = hoje.getFullYear();
        tabela.draw();
        $('#filtroAtivoMensagem').removeClass('alert-secondary').addClass('alert-info').text('Filtro automático de mês ATIVO: Exibindo dados de ' + mesFiltro + '/' + anoFiltro);
    });

    // ====================================================================
    // EVENTO DE CLIQUE DA LINHA (Master-Detail)
    // ====================================================================
    $('#tabelaDados tbody').on('click', 'tr', function() {
        var rowData = tabela.row(this).data();
        if (!rowData) return; 

        $('#tabelaDados tbody tr.selected-row').removeClass('selected-row');
        $(this).addClass('selected-row');

        var devedor = rowData[INDICES.DEVEDOR];
        var cliente = rowData[INDICES.CLIENTE];
        var dataMov = formatarDataParaExibicao(rowData[INDICES.DATA_MOVIMENTO]);
        var negociador = rowData[INDICES.NEGOCIADOR];
        var documento = rowData[INDICES.DOCUMENTO];
        var processo = rowData[INDICES.PROCESSO];
        var parcela = rowData[INDICES.PARCELA];
        var deposito = rowData[INDICES.DEPOSITO];
        var despesa = rowData[INDICES.DESPESA];
        var repasse = rowData[INDICES.REPASSE];
        var hd = rowData[INDICES.HD];
        var hc = rowData[INDICES.HC];
        var comissaoTotal = hd + hc;

        var htmlDetalhe = `
            <div class="detail-group">
                <div class="detail-label">Devedor</div>
                <h4 class="detail-value" id="detailDevedor">${devedor}</h4>
            </div>
            <div class="detail-group">
                <div class="detail-label">Cliente (Acordo)</div>
                <h5 class="detail-value text-muted" id="detailCliente">${cliente}</h5>
            </div>
            
            <button id="btnVerHistorico" class="btn btn-outline-primary btn-sm mb-3">
                <i class="fas fa-history"></i> Ver Histórico Completo do Devedor
            </button>
            <hr>
            
            <div class="detail-group">
                <div class="detail-label">Valor do Depósito</div>
                <h3 class="detail-value-large text-success">${formatarMoeda(deposito)}</h3>
            </div>
            
            <div class="row mb-3">
                <div class="col-6 detail-group">
                    <div class="detail-label">Data Movimento</div>
                    <div class="detail-value">${dataMov}</div>
                </div>
                <div class="col-6 detail-group">
                    <div class="detail-label">Parcela</div>
                    <div class="detail-value"><span class="parcela-badge">${parcela}</span></div>
                </div>
            </div>

            <div class="detail-group">
                <div class="detail-label">Detalhes do Acordo</div>
                <div class="detail-value">Negociador: <strong>${negociador}</strong></div>
                <div class="detail-value">Documento: <strong>${documento}</strong></div>
                <div class="detail-value">Processo: <strong>${processo}</strong></div>
            </div>
            
            <hr>
            <div class="detail-label mb-2">Comissão e Outros Valores</div>
            <div class="row g-2">
                <div class="col-6">
                    <div class="stat-card">
                        <div class="detail-label">HD</div>
                        <div class="detail-value">${formatarMoeda(hd)}</div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="stat-card">
                        <div class="detail-label">HC</div>
                        <div class="detail-value">${formatarMoeda(hc)}</div>
                    </div>
                </div>
                <div class="col-12">
                    <div class="stat-card stat-total mt-2">
                        <div class="detail-label">Comissão Total (HD+HC)</div>
                        <div class="detail-value">${formatarMoeda(comissaoTotal)}</div>
                    </div>
                </div>
                <div class="col-6 mt-2">
                    <div class="stat-card">
                        <div class="detail-label">Repasse</div>
                        <div class="detail-value">${formatarMoeda(repasse)}</div>
                    </div>
                </div>
                <div class="col-6 mt-2">
                    <div class="stat-card">
                        <div class="detail-label">Despesa</div>
                        <div class="detail-value">${formatarMoeda(despesa)}</div>
                    </div>
                </div>
            </div>
        `;

        $('#detail-placeholder').hide();
        $('#detail-content').html(htmlDetalhe).show();
    });
    
    // ====================================================================
    // EVENTO DE CLIQUE DO MODAL (Acionado pelo painel de detalhes)
    // ====================================================================
    $('#detail-content').on('click', '#btnVerHistorico', function() {
        var nomeDevedor = $('#detailDevedor').text();
        
        $('#modalDevedorLabel').text('Histórico de Pagamento');
        $('#modalDevedorSubtitulo').text(nomeDevedor);

        var htmlConteudo = `
            <table class="table" id="modalTabelaDevedor">
                <thead>
                    <tr>
                        <th>Dt. Movimento</th>
                        <th>Cliente (Acordo)</th>
                        <th>Documento</th>
                        <th class="text-center">Parcela</th>
                        <th class="text-end">Depósito</th>
                        <th class="text-end">Comissão</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        var totalDepositoModal = 0;
        var totalComissaoModal = 0;
        var registrosModal = [];

        todosOsDados.forEach(function(rowData) {
            if (rowData[INDICES.DEVEDOR] === nomeDevedor) {
                registrosModal.push(rowData);
            }
        });

        registrosModal.sort((a, b) => (a[INDICES.DATA_MOVIMENTO] < b[INDICES.DATA_MOVIMENTO]) ? -1 : 1);

        registrosModal.forEach(function(rowData) {
            var dataMov = formatarDataParaExibicao(rowData[INDICES.DATA_MOVIMENTO]);
            var cliente = rowData[INDICES.CLIENTE];
            var doc = rowData[INDICES.DOCUMENTO];
            var parcela = rowData[INDICES.PARCELA];
            var deposito = rowData[INDICES.DEPOSITO];
            var comissaoLinha = rowData[INDICES.HD] + rowData[INDICES.HC];

            htmlConteudo += `
                <tr>
                    <td class="coluna-data-destaque">${dataMov}</td>
                    <td>${cliente}</td>
                    <td>${doc}</td>
                    <td class="text-center"><span class="parcela-badge">${parcela}</span></td>
                    <td class="coluna-moeda">${formatarMoeda(deposito)}</td>
                    <td class="coluna-moeda">${formatarMoeda(comissaoLinha)}</td>
                </tr>
            `;

            totalDepositoModal += deposito;
            totalComissaoModal += comissaoLinha;
        });

        htmlConteudo += `
                </tbody>
                <tfoot>
                    <tr>
                        <th colspan="4" class="total-label text-end">TOTAIS:</th>
                        <th class="coluna-moeda total-valor">${formatarMoeda(totalDepositoModal)}</th>
                        <th class="coluna-moeda total-valor">${formatarMoeda(totalComissaoModal)}</th>
                    </tr>
                </tfoot>
            </table>
        `;

        $('#modalDevedorConteudo').html(htmlConteudo);
        modalDevedorInstance.show();
    });
});