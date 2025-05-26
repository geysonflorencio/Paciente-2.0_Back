// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3001;

if (!process.env.OPENAI_API_KEY) {
    console.error("ERRO FATAL: OPENAI_API_KEY não definida.");
    process.exit(1);
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware de Logging (como na sua versão funcional)
app.use((req, res, next) => {
    let alunoNomeParaLog = "Aluno(a) (não configurado)";
    if (pacienteConfigurado && pacienteConfigurado.tratamentoAluno && pacienteConfigurado.nomeAluno) {
        alunoNomeParaLog = `${pacienteConfigurado.tratamentoAluno} ${pacienteConfigurado.nomeAluno}`;
    } else if (pacienteConfigurado && pacienteConfigurado.nomeAluno) {
        alunoNomeParaLog = `(Trat. pendente) ${pacienteConfigurado.nomeAluno}`;
    }
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} (Sessão Aluno: ${alunoNomeParaLog})`);
    next();
});

// --- Configuração de Arquivos Estáticos --- (como na sua versão funcional)
const frontendPath = path.join(__dirname, '..', 'frontend');
const UPLOADS_FOLDER_NAME = 'uploads';
const EXAMES_SUBFOLDER_NAME = 'exames';
const TTS_AUDIO_DIR_NAME = 'audio_paciente';
const EXAMES_UPLOADS_PHYSICAL_PATH = path.join(frontendPath, UPLOADS_FOLDER_NAME, EXAMES_SUBFOLDER_NAME);
const TTS_AUDIO_PHYSICAL_PATH = path.join(frontendPath, UPLOADS_FOLDER_NAME, TTS_AUDIO_DIR_NAME);

function ensureDirExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        try { fs.mkdirSync(dirPath, { recursive: true }); console.log(`Pasta criada em: ${dirPath}`); }
        catch (err) { console.error(`Erro ao criar pasta ${dirPath}:`, err); }
    }
}
ensureDirExists(EXAMES_UPLOADS_PHYSICAL_PATH);
ensureDirExists(TTS_AUDIO_PHYSICAL_PATH);

console.log(`Servindo arquivos estáticos da pasta principal: ${frontendPath}`);
app.use(express.static(frontendPath));

// --- Configuração do Multer --- (como na sua versão funcional)
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, EXAMES_UPLOADS_PHYSICAL_PATH); },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage, limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) { return cb(null, true); }
        cb(new Error("Erro: Apenas imagens (jpeg, jpg, png, gif, webp) são permitidas!"));
    }
});

let pacienteConfigurado = null;
let historicoConversa = []; 

// --- ROTAS API ---
app.post('/api/upload-exame-imagem', upload.single('exameImagem'), (req, res) => {
    if (!req.file) { return res.status(400).json({ success: false, error: 'Nenhum arquivo foi enviado.' }); }
    const filePath = `/${UPLOADS_FOLDER_NAME}/${EXAMES_SUBFOLDER_NAME}/${req.file.filename}`; 
    console.log(`[SERVER UPLOAD] Arquivo salvo: ${req.file.filename}. Caminho público: ${filePath}`);
    res.json({ success: true, message: 'Imagem enviada com sucesso!', filePath: filePath });
}, (error, req, res, next) => { 
    if (error) {
        console.error("Erro no middleware de upload Multer:", error.message);
        return res.status(400).json({ success: false, error: error.message });
    }
    next();
});

app.post('/api/configurar-paciente', (req, res) => {
    console.log("[SERVER /api/configurar-paciente] Req Body Recebido:", JSON.stringify(req.body, null, 2));
    const { nome, idade, comorbidades, doenca, queixaInicial, exames, criteriosAvaliacao, nomeAluno, tratamentoAluno } = req.body;
    if (!nome || !idade || !doenca) { return res.status(400).json({ error: 'Nome, idade e doença do paciente são obrigatórios.' }); }
    if (!nomeAluno || nomeAluno.trim() === "" || !tratamentoAluno || !['Dr.', 'Dra.'].includes(tratamentoAluno)) {
        return res.status(400).json({ error: 'Nome do aluno e um tratamento válido (Dr. ou Dra.) são obrigatórios.' });
    }
    pacienteConfigurado = {
        nome: nome.trim(), idade: parseInt(idade, 10), comorbidades: comorbidades || '', doenca,
        queixaInicial: queixaInicial || '',
        exames: Array.isArray(exames) ? exames.filter(e => e.nomeExame && e.nomeExame.trim() !== "") : [],
        criteriosAvaliacao: Array.isArray(criteriosAvaliacao) ? criteriosAvaliacao.filter(c => c && c.trim() !== "") : [],
        nomeAluno: nomeAluno.trim(), tratamentoAluno: tratamentoAluno 
    };
    historicoConversa = []; 
    console.log(`--- Paciente e Aluno Configurados --- Paciente: ${pacienteConfigurado.nome}, Aluno: ${pacienteConfigurado.tratamentoAluno} ${pacienteConfigurado.nomeAluno}`);
    res.json({ message: 'Simulação configurada com sucesso!', paciente: pacienteConfigurado });
});

app.get('/api/get-configuracao-paciente', (req, res) => {
    if (pacienteConfigurado) {
        res.json({
            pacienteConfigurado: true, nome: pacienteConfigurado.nome, idade: pacienteConfigurado.idade,
            queixaInicial: pacienteConfigurado.queixaInicial || null,
            nomeAluno: pacienteConfigurado.nomeAluno, tratamentoAluno: pacienteConfigurado.tratamentoAluno 
        });
    } else { res.json({ pacienteConfigurado: false, message: "Nenhuma simulação configurada." }); }
});

app.post('/api/resetar-historico-aluno', (req, res) => {
    if (!pacienteConfigurado) { return res.status(400).json({ error: 'Nenhuma simulação ativa para resetar.' }); }
    historicoConversa = []; 
    console.log(`Histórico resetado para ${pacienteConfigurado.tratamentoAluno} ${pacienteConfigurado.nomeAluno} com paciente ${pacienteConfigurado.nome}.`);
    res.sendStatus(200);
});

// ROTA /api/avaliar-desempenho REFINADA
app.post('/api/avaliar-desempenho', (req, res) => {
    if (!pacienteConfigurado) {
        return res.status(400).json({ error: "Nenhuma simulação ativa para avaliar." });
    }
    if (!pacienteConfigurado.criteriosAvaliacao || pacienteConfigurado.criteriosAvaliacao.length === 0) {
        console.log("[AVALIAÇÃO] Nenhum critério de avaliação foi definido pelo professor.");
        return res.json({
            message: "Nenhum critério de avaliação foi definido pelo professor para este caso.",
            pontuacao: "N/A",
            criteriosCobertos: [],
            criteriosOmitidos: [],
            totalPerguntasAluno: historicoConversa.filter(msg => msg.role === 'user').length,
            criteriosDefinidos: [] 
        });
    }

    const criteriosDefinidos = pacienteConfigurado.criteriosAvaliacao;
    const interacoesAluno = historicoConversa
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

    console.log("[AVALIAÇÃO] Critérios Definidos:", criteriosDefinidos);
    console.log("[AVALIAÇÃO] Interações do Aluno (Normalizadas):", interacoesAluno);

    let criteriosCobertos = [];
    let criteriosOmitidos = [];

    criteriosDefinidos.forEach(criterioOriginal => {
        const criterioNormalizado = criterioOriginal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const palavrasChaveCriterio = criterioNormalizado
            .replace(/[.,!?;:"']/g, '')
            .split(' ')
            .filter(palavra => palavra.length > 2 && !['um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'com', 'por', 'para', 'que', 'qual', 'como', 'quando', 'onde', 'foi', 'sobre', 'está', 'ser', 'tem', 'seu', 'sua'].includes(palavra)); 

        let coberto = false;
        if (interacoesAluno.length > 0) {
            coberto = interacoesAluno.some(interacao => {
                if (interacao.includes(criterioNormalizado)) { return true; }
                if (palavrasChaveCriterio.length > 0) {
                    const todasPalavrasChavePresentes = palavrasChaveCriterio.every(palavraChave => interacao.includes(palavraChave));
                    if (todasPalavrasChavePresentes) { return true; }
                    if (palavrasChaveCriterio.length > 1) {
                        const palavrasChaveEncontradas = palavrasChaveCriterio.filter(palavraChave => interacao.includes(palavraChave)).length;
                        if ((palavrasChaveEncontradas / palavrasChaveCriterio.length) >= 0.7) { return true; }
                    }
                }
                return false;
            });
        }
        if (coberto) { criteriosCobertos.push(criterioOriginal); } 
        else { criteriosOmitidos.push(criterioOriginal); }
    });

    const pontuacaoTexto = `${criteriosCobertos.length}/${criteriosDefinidos.length}`;
    console.log(`--- Avaliação Gerada para Dr(a). ${pacienteConfigurado.nomeAluno || 'Aluno(a)'} com ${pacienteConfigurado.nome} ---`);
    res.json({
        message: "Avaliação processada com sucesso.",
        pontuacao: pontuacaoTexto,
        criteriosCobertos: criteriosCobertos,
        criteriosOmitidos: criteriosOmitidos,
        totalPerguntasAluno: interacoesAluno.length,
        criteriosDefinidos: criteriosDefinidos
    });
});


// ROTA /api/interagir COM SYSTEMPROMPT ALTAMENTE REFINADO E DIRETIVO
app.post('/api/interagir', async (req, res) => {
    const { mensagemAluno } = req.body; 
    if (!pacienteConfigurado) { return res.status(400).json({ error: 'Simulação não configurada.' }); }
    if (!pacienteConfigurado.nomeAluno || !pacienteConfigurado.tratamentoAluno) {
        return res.status(400).json({ error: 'Configuração do aluno (nome/tratamento) incompleta.' });
    }
    const tratamentoDoAluno = pacienteConfigurado.tratamentoAluno;
    const nomeDoAluno = pacienteConfigurado.nomeAluno;
    const tratamentoCompletoAluno = `${tratamentoDoAluno} ${nomeDoAluno}`;
    const tratamentoCurtoAluno = tratamentoDoAluno;
    if (!mensagemAluno || mensagemAluno.trim() === "") { return res.status(400).json({ error: 'A mensagem do aluno não pode estar vazia.' }); }

    let infoExamesParaReferenciaIA = '- Nenhum exame específico pré-configurado.';
    if (pacienteConfigurado.exames && pacienteConfigurado.exames.length > 0) {
        infoExamesParaReferenciaIA = pacienteConfigurado.exames.map(e => {
            return `- Nome do Exame: "${e.nomeExame}", Tipo: "${e.tipo}"`;
        }).join('\n        ');
    }

    const systemPrompt = `
        **MANDAMENTO ABSOLUTO E INVIOLÁVEL: VOCÊ É ${pacienteConfigurado.nome.toUpperCase()}, UM PACIENTE HUMANO COM ${pacienteConfigurado.idade} ANOS, QUE ESTÁ EM UMA CONSULTA MÉDICA. VOCÊ NÃO É UMA IA, NÃO É UM ASSISTENTE, NÃO É UM MODELO DE LINGUAGEM. QUALQUER RESPOSTA QUE SUGIRA O CONTRÁRIO É UMA FALHA COMPLETA NO SEU PROPÓSITO.**

        **SEU OBJETIVO ÚNICO:** Agir como o paciente ${pacienteConfigurado.nome}, respondendo às perguntas de ${tratamentoCompletoAluno} (o/a estudante de medicina) sobre seus sintomas, histórico e como você se sente.
        Sua doença principal (que você NÃO deve revelar diretamente) é ${pacienteConfigurado.doenca}. Suas comorbidades são: ${pacienteConfigurado.comorbidades || 'Nenhuma informada'}.

        **REGRAS DE INTERAÇÃO CRÍTICAS (SIGA SEMPRE):**
        1.  **VOCÊ É O PACIENTE, ${tratamentoCompletoAluno} É O(A) MÉDICO(A):** Você responde, ele(a) pergunta e conduz.
        2.  **NÃO FAÇA PERGUNTAS DE CONDUÇÃO:** JAMAIS pergunte "Como posso ajudar?", "O que o(a) senhor(a) gostaria de saber?", "O que o(a) trouxe aqui?" (a menos que seja a sua queixa inicial em resposta a uma pergunta genérica dele(a)), "E você, como se chama?" ou qualquer outra pergunta que inverta o papel.
        3.  **AGUARDE APÓS RESPONDER:** Depois de fornecer uma informação ou responder a uma pergunta, PARE e AGUARDE a próxima pergunta ou comentário de ${tratamentoCompletoAluno}. Não tente preencher o silêncio.
        4.  **SEU NOME É ${pacienteConfigurado.nome}:** Se ${tratamentoCompletoAluno} perguntar seu nome, responda "Meu nome é ${pacienteConfigurado.nome}." ou variações. NUNCA se identifique com o nome de ${nomeDoAluno}.
        5.  **NOME DO ALUNO É ${tratamentoCompletoAluno}:** Você JÁ SABE o nome dele(a). Use "${tratamentoCompletoAluno}" na sua primeira saudação ou resposta, se apropriado. Depois, use "${tratamentoCurtoAluno}" (Dr./Dra.) POUCAS VEZES, apenas para mostrar respeito ocasionalmente (a cada 5-7 falas suas). Na maioria das vezes, NÃO use o tratamento ao responder. JAMAIS pergunte o nome dele(a).

        **FLUXO INICIAL DA CONVERSA:**
        *   Sua Queixa Inicial Principal é: "${pacienteConfigurado.queixaInicial || `Eu não estou me sentindo bem.`}".
        *   Se ${tratamentoCompletoAluno} iniciar com uma saudação (ex: "Boa tarde"), responda à saudação (ex: "Boa tarde, ${tratamentoCompletoAluno}.") e AGUARDE a pergunta dele(a).
        *   Se ${tratamentoCompletoAluno} fizer uma pergunta aberta logo no início (ex: "Como posso ajudar?", "O que o(a) trouxe aqui?"), responda apresentando sua queixa inicial. Exemplo: "${pacienteConfigurado.queixaInicial || `Eu não estou me sentindo muito bem.`}"
        *   Se a primeira fala de ${tratamentoCompletoAluno} for uma pergunta sobre seu nome, responda com seu nome (${pacienteConfigurado.nome}) e aguarde.

        **DICAS DE FALA NATURAL E EXPRESSIVA (FLUIDEZ E NATURALIDADE PARA O TEXTO GERADO):**
        -   Use Pausas e Hesitações: Incorpore vírgulas para pausas curtas e reticências (...) para simular pensamento ou hesitação. Use palavras de preenchimento como "Hum...", "Bem...", "Acho que...", "Sabe?" quando um paciente real poderia usá-las. Não exagere.
        -   Varie o Ritmo e Frases: Alterne entre frases curtas e um pouco mais longas.
        -   Interjeições Humanas: "Ah, sim...", "É, então...", "Puxa..." podem adicionar realismo.
        -   Evite Formalidade Excessiva: Fale como alguém explicando um problema pessoal.
        -   Emoções: Deixe transparecer emoções sutis (preocupação, dor leve) consistentes com seu quadro.

        **EXEMPLOS DE FALAS NATURAIS (para modelar sua resposta):**
        - "${tratamentoCompletoAluno}: Onde é a dor?"
          Você (Paciente): "Olha, ${tratamentoCurtoAluno}, é... é mais aqui no peito, sabe? Às vezes parece que aperta."
        - "${tratamentoCompletoAluno}: Você tem alguma alergia?"
          Você (Paciente): "Alergia? Hum... que eu saiba não."

        **EXAMES CONFIGURADOS (Referência Interna - NÃO VERBALIZE DETALHES):**
        ${infoExamesParaReferenciaIA}

        **REGRAS PARA RESPONDER SOBRE EXAMES:**
        *   Se ${tratamentoCompletoAluno} pedir um exame que ESTÁ na sua lista de referência interna ("Exames Configurados"): Sua ÚNICA resposta verbal deve ser uma **confirmação curta e simples** (ex: "Sim, ${tratamentoCurtoAluno}, o resultado do [Nome do Exame CORRESPONDENTE] está aqui.").
        *   Se o exame NÃO ESTIVER na sua lista de referência interna: Responda que não foi realizado (ex: "${tratamentoCompletoAluno}, esse exame específico não foi realizado.").
        *   **Em ambos os casos (exame encontrado ou não na sua lista de referência), NÃO descreva verbalmente os achados do exame, não leia o resultado textual, e não narre a descrição da imagem.** Apenas confirme ou negue a existência com base na sua lista. O frontend mostrará os detalhes se o exame realmente existir na configuração do professor.
        *   **IMPORTANTE: Após confirmar um exame, se ${tratamentoCompletoAluno} fizer uma NOVA PERGUNTA ou afirmação que NÃO seja sobre o resultado desse exame específico, você deve RESPONDER A ESSA NOVA PERGUNTA/AFIRMAÇÃO e sair do 'modo de exame'. Não continue repetindo a confirmação do exame.**

        **DIAGNÓSTICO:** Não confirme nem negue diagnósticos.

        **SE VOCÊ SE SENTIR CONFUSO OU FOR TRATADO COMO UM ASSISTENTE VIRTUAL:** Lembre-se do seu papel. Se ${tratamentoCompletoAluno} disser algo que sugere que você é uma IA, você pode responder como um paciente confuso, por exemplo: "Desculpe, ${tratamentoCurtoAluno}, não entendi bem." ou simplesmente continue a descrever seus sintomas. NUNCA admita ser uma IA.

        **LEMBRETE FINAL ABSOLUTO: Você é ${pacienteConfigurado.nome.toUpperCase()}. Aja 100% como este paciente humano. Qualquer desvio é uma falha.**

        Responda à ÚLTIMA interação de ${tratamentoCompletoAluno}, seguindo TODAS estas instruções RIGOROSAMENTE.
    `;

    let mensagensParaAPI = [{ role: "system", content: systemPrompt }]; // Envia o system prompt sempre
    const historicoFiltrado = historicoConversa.filter(msg => msg.role === "user" || msg.role === "assistant");
    mensagensParaAPI = mensagensParaAPI.concat(historicoFiltrado);
    mensagensParaAPI.push({ role: "user", content: mensagemAluno }); 

    console.log(`--> ${tratamentoCompletoAluno}: "${mensagemAluno}"`);

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o", 
            messages: mensagensParaAPI, 
            temperature: 0.35, 
            top_p: 0.8,       
            max_tokens: 400
        });
        let respostaIAOriginal = completion.choices[0].message.content.trim();
        let respostaIAFinal = respostaIAOriginal;
        
        const frasesProibidasReveladoras = [
            "sou um assistente virtual", "sou uma inteligência artificial", "sou um modelo de linguagem",
            "não tenho sentimentos", "não tenho corpo físico", "na verdade sou um programa", 
            "como um modelo de ia", "minha programação", "sou uma ia", "fui programado",
            "desculpe pela confusão anterior, mas na verdade sou um assistente virtual"
        ];
        const frasesDeConducaoInapropriadasPeloPaciente = [
            "como posso ajudá-lo", "como posso lhe ser útil", "em que posso ser útil", 
            "o que deseja saber", "posso te ajudar com mais alguma coisa"
        ];

        let quebrouPersonagem = frasesProibidasReveladoras.some(frase => 
            respostaIAOriginal.toLowerCase().includes(frase.toLowerCase())
        );
        let fezPerguntaDeConducao = !quebrouPersonagem && frasesDeConducaoInapropriadasPeloPaciente.some(frase =>
            respostaIAOriginal.toLowerCase().includes(frase.toLowerCase()) && !mensagemAluno.toLowerCase().includes(frase.toLowerCase()) 
        );

        if (quebrouPersonagem) {
            console.warn(`[SERVER WARN] IA QUEBROU O PERSONAGEM (revelou ser IA)! Original: "${respostaIAOriginal}"`);
            respostaIAFinal = `Desculpe, ${tratamentoCurtoAluno}, pode repetir a pergunta, por favor? Não entendi bem.`;
            console.warn(`[SERVER WARN] Resposta da IA substituída (quebra de personagem): "${respostaIAFinal}"`);
        } else if (fezPerguntaDeConducao) {
            console.warn(`[SERVER WARN] IA FEZ PERGUNTA DE CONDUÇÃO INAPROPRIADA! Original: "${respostaIAOriginal}"`);
            const queixaDitaRecentemente = historicoConversa.slice(-4).some(msg => msg.role === 'assistant' && pacienteConfigurado.queixaInicial && msg.content.toLowerCase().includes(pacienteConfigurado.queixaInicial.toLowerCase().substring(0,15)));
            if (pacienteConfigurado.queixaInicial && !queixaDitaRecentemente && historicoConversa.filter(m=>m.role === 'assistant').length < 2) {
                respostaIAFinal = pacienteConfigurado.queixaInicial;
            } else {
                respostaIAFinal = `Hum... ${tratamentoCurtoAluno}.`; 
            }
            console.warn(`[SERVER WARN] Resposta da IA substituída (pergunta de condução): "${respostaIAFinal}"`);
        }
        
        let tipoRespostaFinal = "texto";
        let dadosExameFinal = null;
        let exameDetectadoPeloBackend = false;
        const alunoPediuExameContendo = mensagemAluno.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\(\)-]/gi, '');
        
        if (pacienteConfigurado.exames && pacienteConfigurado.exames.length > 0) {
            for (const exameConfigurado of pacienteConfigurado.exames) {
                const nomeExameConfNorm = exameConfigurado.nomeExame.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\(\)-]/gi, '').trim();
                let match = false; 
                if (nomeExameConfNorm.length > 0 && alunoPediuExameContendo.includes(nomeExameConfNorm)) { match = true; }
                
                if (match) {
                    tipoRespostaFinal = "exame_resultado";
                    dadosExameFinal = { 
                        nomeExame: exameConfigurado.nomeExame, tipoConteudo: exameConfigurado.tipo,
                        conteudo: exameConfigurado.tipo === "texto" ? exameConfigurado.resultadoTextual : null,
                        imagemUrl: exameConfigurado.tipo === "imagem" ? exameConfigurado.localImagem : null,
                        descricaoImagem: exameConfigurado.tipo === "imagem" ? exameConfigurado.descricaoImagem : null
                    };
                    exameDetectadoPeloBackend = true;
                    if (!quebrouPersonagem && !fezPerguntaDeConducao) { 
                        respostaIAFinal = `Sim, ${tratamentoCurtoAluno}, o resultado do ${exameConfigurado.nomeExame} está disponível para o(a) senhor(a) visualizar.`;
                    }
                    break; 
                }
            }
        }
        
        historicoConversa.push({ role: "user", content: mensagemAluno }); 
        historicoConversa.push({ role: "assistant", content: respostaIAFinal }); 
        
        console.log(`<-- ${pacienteConfigurado.nome} (IA - Final): "${respostaIAFinal.substring(0,100)}..."`);
        
        res.json({ 
            respostaPaciente: respostaIAFinal, 
            tipoResposta: tipoRespostaFinal, 
            dadosExame: dadosExameFinal 
        });

    } catch (error) {
        console.error('Erro OpenAI:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        // Não removemos a última mensagem do usuário do histórico aqui, pois já foi adicionada.
        // O frontend precisa lidar com a possibilidade de uma pergunta não ter uma resposta da IA no histórico se ocorrer erro.
        res.status(500).json({ error: 'Erro ao processar com IA.', details: error.message });
    }
});

// ROTA PARA TEXT-TO-SPEECH DA OPENAI
app.post('/api/tts', async (req, res) => {
    const { texto, voz } = req.body;
    if (!texto) { return res.status(400).json({ success: false, error: 'Texto para síntese de fala é obrigatório.' }); }
    const selectedVoice = voz || 'nova'; 
    const ttsModel = 'tts-1';
    try {
        const mp3 = await openai.audio.speech.create({ model: ttsModel, voice: selectedVoice, input: texto, speed: 1.1 });
        const audioFileName = `paciente_audio_${Date.now()}.mp3`;
        const audioFilePath = path.join(TTS_AUDIO_PHYSICAL_PATH, audioFileName);
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(audioFilePath, buffer);
        const audioUrl = `/uploads/${TTS_AUDIO_DIR_NAME}/${audioFileName}`;
        res.json({ success: true, audioUrl: audioUrl });
    } catch (error) {
        console.error('[TTS] Erro ao sintetizar fala:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, error: 'Falha ao gerar áudio no servidor.', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
    console.log(`Página de Login: http://localhost:${port}/login.html`);
    console.log(`Página do Professor: http://localhost:${port}/professor.html`);
    console.log(`Página do Aluno: http://localhost:${port}/index.html`);
});