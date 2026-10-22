// ============================================
// SUPABASE RAG APPLICATION
// ============================================

// Check if config is valid BEFORE trying to create Supabase client
function isConfigValid() {
    if (typeof SUPABASE_CONFIG === 'undefined') return false;

    const isPlaceholderUrl = !SUPABASE_CONFIG.url ||
        SUPABASE_CONFIG.url.includes('YOUR_SUPABASE') ||
        SUPABASE_CONFIG.url.includes('YOUR-PROJECT') ||
        SUPABASE_CONFIG.url === 'https://your-project-ref.supabase.co' ||
        SUPABASE_CONFIG.url === 'https://YOUR_PROJECT_REF.supabase.co';

    const isPlaceholderKey = !SUPABASE_CONFIG.anonKey ||
        SUPABASE_CONFIG.anonKey.includes('YOUR_SUPABASE') ||
        SUPABASE_CONFIG.anonKey.includes('your-anon-key') ||
        SUPABASE_CONFIG.anonKey === 'YOUR_SUPABASE_ANON_KEY_HERE' ||
        SUPABASE_CONFIG.anonKey.length < 20;

    return !isPlaceholderUrl && !isPlaceholderKey;
}

// Initialize Supabase client only if config is valid
let supabaseClient = null;
let configIsValid = false;
let appInitialized = false;

function initializeSupabase() {
    configIsValid = isConfigValid();
    if (configIsValid && !supabaseClient) {
        try {
            supabaseClient = window.supabase.createClient(
                SUPABASE_CONFIG.url,
                SUPABASE_CONFIG.anonKey
            );
            // Listen for auth state changes
            supabaseClient.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN' && session) {
                    showApp(session.user);
                } else if (event === 'SIGNED_OUT') {
                    showLogin();
                }
            });
        } catch (err) {
            console.error('Failed to initialize Supabase client:', err);
        }
    }
}


// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const emailInput = document.getElementById('email-input');
const loginBtn = document.getElementById('login-btn');
const loginMessage = document.getElementById('login-message');
const logoutBtn = document.getElementById('logout-btn');
const userEmailSpan = document.getElementById('user-email');
const loading = document.getElementById('loading');

// Setup Banner Elements
const setupBanner = document.getElementById('setup-banner');
const githubPagesUrl = document.getElementById('github-pages-url');
const copyUrlBtn = document.getElementById('copy-url-btn');
const closeSetupBannerBtn = document.getElementById('close-setup-banner');
const checkConfig = document.getElementById('check-config');
const checkConnection = document.getElementById('check-connection');
const checkRedirect = document.getElementById('check-redirect');

// Search Panel Elements
const keywordInput = document.getElementById('keyword-input');
const keywordBtn = document.getElementById('keyword-btn');
const keywordResults = document.getElementById('keyword-results');
const keywordStatus = document.getElementById('keyword-status');

const semanticInput = document.getElementById('semantic-input');
const semanticBtn = document.getElementById('semantic-btn');
const semanticResults = document.getElementById('semantic-results');
const semanticStatus = document.getElementById('semantic-status');

const ragInput = document.getElementById('rag-input');
const ragBtn = document.getElementById('rag-btn');
const ragResults = document.getElementById('rag-results');
const ragStatus = document.getElementById('rag-status');

// ============================================
// SETUP BANNER DETECTION
// ============================================

async function runSetupChecks() {
    const setupStatus = {
        configValid: false,
        connectionOk: false,
        allGood: false
    };

    // Calculate and display GitHub Pages URL (full URL with path)
    const currentUrl = window.location.origin + window.location.pathname;
    if (githubPagesUrl) {
        githubPagesUrl.textContent = currentUrl;
    }

    // Set setup guide link to GitHub repo (for better preview)
    const setupGuideLink = document.getElementById('setup-guide-link');
    if (setupGuideLink && currentUrl.includes('github.io')) {
        const pathParts = window.location.pathname.split('/').filter(p => p);
        const repoName = pathParts[0] || 'conference-rag';
        const username = currentUrl.split('.github.io')[0].split('//')[1];
        setupGuideLink.href = `https://github.com/${username}/${repoName}/blob/main/README.md`;
    } else if (setupGuideLink) {
        setupGuideLink.href = 'README.md';
    }

    // Set Supabase URL configuration link
    const supabaseConfigLink = document.getElementById('supabase-config-link');
    if (supabaseConfigLink && typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url) {
        try {
            const supabaseUrl = new URL(SUPABASE_CONFIG.url);
            const projectId = supabaseUrl.hostname.split('.')[0];
            supabaseConfigLink.href = `https://supabase.com/dashboard/project/${projectId}/auth/url-configuration`;
        } catch (err) {
            supabaseConfigLink.style.display = 'none';
        }
    } else if (supabaseConfigLink) {
        supabaseConfigLink.style.display = 'none';
    }

    // Check 1: Config has real values
    if (!configIsValid) {
        updateCheckItem(checkConfig, 'error', '❌', 'Configure Supabase credentials in config.js');
        updateCheckItem(checkConnection, 'warning', '⏳', 'Waiting for config...');
    } else {
        updateCheckItem(checkConfig, 'success', '✅', 'Supabase credentials configured');
        setupStatus.configValid = true;

        // Check 2: Supabase connection
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient.auth.getSession();
                if (error) {
                    updateCheckItem(checkConnection, 'error', '❌', `Connection failed: ${error.message}`);
                } else {
                    updateCheckItem(checkConnection, 'success', '✅', 'Supabase connection OK');
                    setupStatus.connectionOk = true;
                }
            } catch (err) {
                updateCheckItem(checkConnection, 'error', '❌', 'Connection failed - check config');
            }
        } else {
            updateCheckItem(checkConnection, 'error', '❌', 'Failed to create Supabase client');
        }
    }

    // Check 3: Redirect URL reminder
    updateCheckItem(checkRedirect, 'warning', '⚠️', `Add ${currentUrl} to Supabase redirect URLs`);

    // Show/hide banner
    setupStatus.allGood = setupStatus.configValid && setupStatus.connectionOk;
    const bannerDismissed = sessionStorage.getItem('setup_banner_dismissed');
    if (setupBanner) {
        if (!setupStatus.allGood && !bannerDismissed) {
            setupBanner.classList.remove('hidden');
        } else {
            setupBanner.classList.add('hidden');
        }
    }

    return setupStatus;
}

function updateCheckItem(element, status, icon, text) {
    if (!element) return;
    element.className = `setup-item ${status}`;
    const iconSpan = element.querySelector('.check-icon');
    const textSpan = element.querySelector('span:last-child');
    if (iconSpan) iconSpan.textContent = icon;
    if (textSpan) textSpan.textContent = text;
}

// Copy URL to clipboard
if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', async () => {
        const url = githubPagesUrl ? githubPagesUrl.textContent : (window.location.origin + window.location.pathname);
        try {
            await navigator.clipboard.writeText(url);
            copyUrlBtn.textContent = '✅';
            copyUrlBtn.classList.add('copied');
            setTimeout(() => {
                copyUrlBtn.textContent = '📋';
                copyUrlBtn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy URL:', err);
        }
    });
}

// Dismiss setup banner
if (closeSetupBannerBtn) {
    closeSetupBannerBtn.addEventListener('click', () => {
        if (setupBanner) {
            setupBanner.classList.add('hidden');
        }
        sessionStorage.setItem('setup_banner_dismissed', 'true');
    });
}

// ============================================
// AUTHENTICATION
// ============================================

async function checkSession() {
    if (!supabaseClient) {
        showLogin();
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        showApp(session.user);
    } else {
        showLogin();
    }
}

// Handle magic link login
if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        if (!supabaseClient) {
            showMessage('Please configure Supabase first (see Setup Guide)', 'error');
            return;
        }

        const email = emailInput.value.trim();

        if (!email) {
            showMessage('Please enter your email', 'error');
            return;
        }

        showLoading(true);

        const { error } = await supabaseClient.auth.signInWithOtp({
            email: email,
            options: {
                emailRedirectTo: window.location.origin + window.location.pathname
            }
        });

        showLoading(false);

        if (error) {
            showMessage(`Error: ${error.message}`, 'error');
        } else {
            showMessage('Check your email for the magic link!', 'success');
        }
    });
}

// Handle logout
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (supabaseClient) {
            await supabaseClient.auth.signOut();
        }
        showLogin();
    });
}

// Auth state change listener is now set up inside initializeSupabase()

// ============================================
// UI STATE MANAGEMENT
// ============================================

function showLogin() {
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (appScreen) appScreen.classList.add('hidden');
    const journalList = document.getElementById('journal-entries');
    if (journalList) journalList.innerHTML = '';
}

function showApp(user) {
    if (loginScreen) loginScreen.classList.add('hidden');
    if (appScreen) appScreen.classList.remove('hidden');
    if (userEmailSpan) userEmailSpan.textContent = user.email;
    // Check search readiness when user logs in
    checkSearchReadiness();
    loadJournal();
}

function showMessage(text, type) {
    if (loginMessage) {
        loginMessage.textContent = text;
        loginMessage.className = `message ${type}`;
        loginMessage.classList.remove('hidden');
    }
}

function showLoading(show) {
    if (loading) {
        if (show) {
            loading.classList.remove('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }
}

// ============================================
// SEARCH READINESS DETECTION
// ============================================

// Guard against double execution (checkSession + onAuthStateChange both call showApp)
let readinessCheckRunning = false;

async function checkSearchReadiness() {
    if (!supabaseClient || readinessCheckRunning) return;
    readinessCheckRunning = true;

    try {
        // --- Check 1: Any data at all? (keyword search just needs text) ---
        const { count: totalCount, error: totalError } = await supabaseClient
            .from('sentence_embeddings')
            .select('*', { count: 'exact', head: true });

        const hasData = !totalError && totalCount > 0;
        setSearchReady('keyword', hasData);

        // --- Check 2: Data with embeddings? (semantic search needs vectors) ---
        let hasEmbeddings = false;
        if (hasData) {
            const { count, error } = await supabaseClient
                 .from('talk_chunks')
                .select('*', { count: 'exact', head: true })
                .not('embedding', 'is', null);
            hasEmbeddings = !error && count > 0;
        }

        // --- 1 embed-question call (only if DB has embeddings) ---
        let semanticReady = false;
        if (hasEmbeddings) {
            try {
                const { data, error: fnError } = await supabaseClient.functions.invoke('embed-question', {
                    body: { question: 'test' }
                });
                semanticReady = !fnError;
            } catch {
                // CORS or network error → function not deployed
            }
        }
        setSearchReady('semantic', semanticReady);

        // --- 1 generate-answer call (only if semantic pipeline is ready) ---
        if (!semanticReady) {
            setSearchReady('rag', false);
        } else {
            try {
                const { data, error: fnError } = await supabaseClient.functions.invoke('generate-answer', {
                    body: { question: 'test', context_talks: [] }
                });
                setSearchReady('rag', !fnError || fnError.context?.status !== 404);
            } catch {
                setSearchReady('rag', false);
            }
        }
    } catch (err) {
        console.log('Readiness check failed:', err.message);
        setSearchReady('keyword', false);
        setSearchReady('semantic', false);
        setSearchReady('rag', false);
    } finally {
        readinessCheckRunning = false;
    }
}

function setSearchReady(type, ready) {
    const statusEl = document.getElementById(`${type}-status`);
    const inputEl = document.getElementById(`${type}-input`);
    const btnEl = document.getElementById(`${type}-btn`);
    const panelEl = document.getElementById(`${type}-panel`);

    if (statusEl) {
        if (ready) {
            statusEl.textContent = '🟢 Ready';
            statusEl.className = 'status-badge ready';
        } else {
            statusEl.textContent = '🔴 Not Ready';
            statusEl.className = 'status-badge not-ready';
        }
    }

    if (inputEl) inputEl.disabled = !ready;
    if (btnEl) btnEl.disabled = !ready;

    if (panelEl) {
        if (ready) {
            panelEl.classList.add('panel-ready');
            panelEl.classList.remove('panel-not-ready');
        } else {
            panelEl.classList.add('panel-not-ready');
            panelEl.classList.remove('panel-ready');
        }
    }
}

// ============================================
// KEYWORD SEARCH
// ============================================

async function keywordSearch() {
    const query = keywordInput ? keywordInput.value.trim() : '';
    if (!query || !supabaseClient) return;

    showLoading(true);
    clearResults('keyword');

    try {
        // Search sentence_embeddings that contain the keyword (case-insensitive)
        const { data, error } = await supabaseClient
            .from('sentence_embeddings')
            .select('text, talk_id, title, speaker, url')
            .ilike('text', `%${query}%`)
            .limit(20);

        if (error) throw new Error(`Search failed: ${error.message}`);

        if (!data || data.length === 0) {
            showResults('keyword', '<div class="no-results">No results found. Try different keywords.</div>');
            return;
        }

        // Group by talk
        const talks = {};
        for (const row of data) {
            const talkId = row.talk_id;
            if (!talks[talkId]) {
                talks[talkId] = {
                    title: row.title || 'Unknown Talk',
                    speaker: row.speaker || 'Unknown Speaker',
                    url: row.url || '',
                    sentences: []
                };
            }
            talks[talkId].sentences.push(highlightKeyword(row.text, query));
        }

        let html = '';
        for (const talk of Object.values(talks)) {
            html += `<div class="result-card">
                <div class="result-title"><a href="${escapeHtml(talk.url)}" target="_blank" class="result-title-link">${escapeHtml(talk.title)}</a></div>
                <div class="result-speaker">by ${escapeHtml(talk.speaker)}</div>
                <div class="result-sentences">${talk.sentences.slice(0, 3).join('<br>')}</div>
            </div>`;
        }
        showResults('keyword', html);

    } catch (error) {
        showResults('keyword', `<div class="result-error">Error: ${escapeHtml(error.message)}</div>`);
    } finally {
        showLoading(false);
    }
}

function highlightKeyword(text, keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

// ============================================
// SEMANTIC SEARCH
// ============================================

// ============================================
// SEMANTIC SEARCH (grouped by talk)
// ============================================
// In app.js, replace the whole existing `async function semanticSearch() { ... }`
// with this version, and paste `searchTalks()` below `searchSentences()`.

async function semanticSearch() {
    const query = semanticInput ? semanticInput.value.trim() : '';
    if (!query || !supabaseClient) return;

    showLoading(true);
    clearResults('semantic');

    try {
        // Step 1: Get embedding
        const embedding = await getEmbedding(query);

        // Step 2: Find the best-matching TALKS (not sentences)
         const talks = await searchTalks(query, embedding);

        if (!talks || talks.length === 0) {
            showResults('semantic', '<div class="no-results">No similar content found. Try a different query.</div>');
            return;
        }

        // Step 3: One card per talk, with its best passages as a preview
        let html = '';
        for (const talk of talks) {
            const badge = similarityBadge(talk.best_similarity);
            const when = [talk.season, talk.year].filter(Boolean).join(' ');
            const passages = (talk.top_sentences || [])
                .slice(0, 2)
                .map(s => `“${escapeHtml(s)}”`)
                .join('<br>');
            const more = talk.matching_sentences > 1
                ? ` · ${talk.matching_sentences} matching passages`
                : '';
            const found = talk.keyword_rank && talk.semantic_rank ? ' · meaning + keywords'
                : talk.keyword_rank ? ' · keyword match'
                : '';

            html += `<div class="result-card">
                <div class="result-card-header">
                    <div>
                        <div class="result-title"><a href="${escapeHtml(talk.url || '#')}" target="_blank" class="result-title-link">${escapeHtml(talk.title)}</a></div>
                        <div class="result-speaker">${escapeHtml(talk.speaker || '')}${when ? ' · ' + escapeHtml(when) : ''}${more}${found}</div>
                    </div>
                    ${badge}
                </div>
                <div class="result-sentences">${passages}</div>
            </div>`;
        }
        showResults('semantic', html);

    } catch (error) {
        showResults('semantic', `<div class="result-error">Error: ${escapeHtml(error.message)}</div>`);
    } finally {
        showLoading(false);
    }
}

// Search talks using vector similarity, grouped by talk (see match_talks.sql)
async function searchTalks(query, embedding) {
    if (!supabaseClient) throw new Error('Supabase not configured');
 
    const { data, error } = await supabaseClient.rpc('hybrid_match_talks', {
        query_text: query,
        query_embedding: embedding,
        match_count: 10,
        candidate_count: 200
    });
 
    if (error) throw new Error(`Database search failed: ${error.message}`);
    return data;
}

// ============================================
// RAG (ASK A QUESTION)
// ============================================

async function askQuestion() {
    const question = ragInput ? ragInput.value.trim() : '';
    if (!question || !supabaseClient) return;

    showLoading(true);
    clearResults('rag');

    try {
        // Step 1: Get embedding
        const embedding = await getEmbedding(question);

         // Step 2 + 3: Hybrid search already returns talks, best first
        const talks = await searchTalks(question, embedding);
        const topTalks = talks.slice(0, 3).map(t => ({
            talk_id: t.talk_id,
            title: t.title,
            speaker: t.speaker,
            url: t.url,
            text: (t.top_sentences || []).join(' '),
            avgSimilarity: t.best_similarity
        }));

        // Skip the AI when no talk is a real match
        const MIN_SIMILARITY = 0.30;
        const bestMatch = Math.max(0, ...topTalks.map(t => t.avgSimilarity || 0));
        if (topTalks.length === 0 || bestMatch < MIN_SIMILARITY) {
            showResults('rag', '<div class="no-results">I couldn’t find any conference talks that address this question. Try rephrasing it, or ask about a gospel topic.</div>');
            return;
        }

        // Step 4: Fetch full talk text for richer context
        const enrichedTalks = await fetchFullTalkText(topTalks);

        // Step 5: Generate answer with full context
        const answer = await generateAnswer(question, enrichedTalks);

        lastRagResult = {
           question: question,
           answer: answer,
           talks: topTalks.map(t => ({ title: t.title, speaker: t.speaker, url: t.url }))
        };

        // Compute overall similarity (weighted avg across source talks)
        const overallSimilarity = topTalks.reduce((sum, t) => sum + t.avgSimilarity, 0) / topTalks.length;
        const overallBadge = similarityBadge(overallSimilarity);
        const simClass = overallSimilarity >= 0.70 ? 'similarity-high'
            : overallSimilarity >= 0.40 ? 'similarity-mid' : 'similarity-low';

        let html = `<div class="result-card rag-answer rag-${simClass}">
            <div class="result-card-header">
                <div class="result-title">AI Answer</div>
                ${overallBadge}
            </div>
            <div class="result-sentences">${escapeHtml(answer)}</div>
        </div>`;

        // Show source talks with per-talk similarity badges and links
        html += '<div class="result-sources"><strong>Sources:</strong></div>';
        for (const talk of topTalks) {
            const talkBadge = similarityBadge(talk.avgSimilarity);
            html += `<div class="result-card result-source">
                <div class="result-card-header">
                    <div>
                        <div class="result-title"><a href="${escapeHtml(talk.url)}" target="_blank" class="result-title-link">${escapeHtml(talk.title)}</a></div>
                        <div class="result-speaker">by ${escapeHtml(talk.speaker)}</div>
                    </div>
                    ${talkBadge}
                </div>
            </div>`;
        }
        html += '<button id="save-journal-btn">💾 Save to journal</button>';
        showResults('rag', html);
        const saveBtn = document.getElementById('save-journal-btn');
        if (saveBtn) {
           saveBtn.className = ragBtn ? ragBtn.className : '';   // match the Ask button's style
           saveBtn.addEventListener('click', () => saveToJournal(saveBtn));
        }
    } catch (error) {
        showResults('rag', `<div class="result-error">Error: ${escapeHtml(error.message)}</div>`);
    } finally {
        showLoading(false);
    }
}

// ============================================
// SHARED SEARCH UTILITIES
// ============================================

// Get embedding via Edge Function
async function getEmbedding(text) {
    const { data, error } = await supabaseClient.functions.invoke('embed-question', {
        body: { question: text }
    });

    if (error) {
        throw new Error(data?.error || 'Failed to get embedding');
    }

    return data.embedding;
}

// Search sentences using vector similarity
async function searchSentences(embedding) {
    if (!supabaseClient) throw new Error('Supabase not configured');

    const { data, error } = await supabaseClient.rpc('match_sentences', {
        query_embedding: embedding,
        match_count: 20
    });

    if (error) throw new Error(`Database search failed: ${error.message}`);
    return data;
}

// Group search results by talk, computing average similarity per talk
function groupByTalk(sentences) {
    const talkMap = {};

    for (const sent of sentences) {
        if (!talkMap[sent.talk_id]) {
            talkMap[sent.talk_id] = {
                talk_id: sent.talk_id,
                title: sent.title,
                speaker: sent.speaker,
                url: sent.url,
                sentences: [],
                totalSimilarity: 0
            };
        }
        talkMap[sent.talk_id].sentences.push(sent.text);
        talkMap[sent.talk_id].totalSimilarity += sent.similarity;
    }

    return Object.values(talkMap)
        .sort((a, b) => b.totalSimilarity / b.sentences.length - a.totalSimilarity / a.sentences.length)
        .slice(0, 3)
        .map(talk => ({
            talk_id: talk.talk_id,
            title: talk.title,
            speaker: talk.speaker,
            url: talk.url,
            text: talk.sentences.join(' '),
            // TODO: Is average similarity the right metric? Alternatives worth researching:
            // - Max similarity (best single match per talk)
            // - Average of top-3 sentences (reduces noise from weak matches)
            // - Weighted by sentence count (rewards talks with more matches)
            avgSimilarity: talk.totalSimilarity / talk.sentences.length
        }));
}

// Fetch full talk text by querying all sentences for given talk_ids, ordered by sentence_num.
// Uses a single batched query via .in() for all talk_ids — no parallel calls needed.
async function fetchFullTalkText(talks) {
    if (!supabaseClient || !talks.length) return talks;

    const talkIds = talks.map(t => t.talk_id);

    const { data, error } = await supabaseClient
        .from('sentence_embeddings')
        .select('talk_id, sentence_num, text')
        .in('talk_id', talkIds)
        .order('talk_id')
        .order('sentence_num');

    if (error || !data) {
        console.warn('Failed to fetch full talk text, using snippets:', error?.message);
        return talks;
    }

    // Group fetched sentences by talk_id
    const fullTextMap = {};
    for (const row of data) {
        if (!fullTextMap[row.talk_id]) fullTextMap[row.talk_id] = [];
        fullTextMap[row.talk_id].push(row.text);
    }

    // Replace snippet text with full talk text
    return talks.map(talk => ({
        ...talk,
        text: fullTextMap[talk.talk_id]
            ? fullTextMap[talk.talk_id].join(' ')
            : talk.text
    }));
}

// Generate answer via Edge Function
async function generateAnswer(question, contextTalks) {
    const { data, error } = await supabaseClient.functions.invoke('generate-answer', {
        body: {
            question: question,
            context_talks: contextTalks
        }
    });

    if (error) {
        throw new Error(data?.error || 'Failed to generate answer');
    }

    return data.answer;
}
// ============================================
// PERSONAL STUDY JOURNAL — app.js changes
// ============================================
 
let lastRagResult = null;   // the most recent RAG answer, ready to save
 
// Creates the "My Study Journal" panel right below the Ask a Question panel
// (built in JavaScript so index.html doesn't need to change).
function ensureJournalPanel() {
    let panel = document.getElementById('journal-panel');
    if (panel) return panel;
 
    const ragPanel = document.getElementById('rag-panel');
    panel = document.createElement('div');
    panel.id = 'journal-panel';
    // Reuse the RAG panel's styling (minus its ready/not-ready color)
    panel.className = ragPanel ? ragPanel.className.replace(/panel-(not-)?ready/g, '').trim() : '';
    panel.innerHTML = `
        <div class="result-title" style="font-size:1.15em">📓 My Study Journal</div>
        <div class="result-speaker">Answers you've saved. Only you can see these.</div>
        <div id="journal-entries"></div>`;
 
    if (ragPanel && ragPanel.parentElement) {
        ragPanel.parentElement.insertBefore(panel, ragPanel.nextSibling);
    } else if (appScreen) {
        appScreen.appendChild(panel);
    }
    return panel;
}
 
// Read MY entries. There's no "where user_id = ..." here on purpose:
// RLS filters the rows on the database side using the JWT.
async function loadJournal() {
    if (!supabaseClient) return;
    ensureJournalPanel();
    const list = document.getElementById('journal-entries');
 
    const { data, error } = await supabaseClient
        .from('journal_entries')
        .select('id, question, answer, talks, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
 
    if (error) {
        list.innerHTML = `<div class="result-error">Couldn't load your journal: ${escapeHtml(error.message)}</div>`;
        return;
    }
    if (!data.length) {
        list.innerHTML = '<div class="no-results">No saved entries yet. Ask a question, then click “Save to journal”.</div>';
        return;
    }
 
    list.innerHTML = data.map(entry => `
        <div class="result-card">
            <div class="result-card-header">
                <div>
                    <div class="result-title">${escapeHtml(entry.question)}</div>
                    <div class="result-speaker">${new Date(entry.created_at).toLocaleDateString()}</div>
                </div>
                <button class="journal-delete" data-id="${entry.id}" title="Delete entry">🗑️</button>
            </div>
            <details>
                <summary>Show answer</summary>
                <div class="result-sentences" style="white-space:pre-line">${escapeHtml(entry.answer)}</div>
            </details>
            <div class="result-sentences">
                ${(entry.talks || []).map(t =>
                    `<a href="${escapeHtml(t.url || '#')}" target="_blank">${escapeHtml(t.title || '')}</a> — ${escapeHtml(t.speaker || '')}`
                ).join('<br>')}
            </div>
        </div>`).join('');
 
    list.querySelectorAll('.journal-delete').forEach(btn =>
        btn.addEventListener('click', () => deleteJournalEntry(btn.dataset.id)));
}
 
// Save the latest RAG answer. We send no user_id: the column's default,
// auth.uid(), fills it in from the JWT, and the insert policy double-checks it.
async function saveToJournal(btn) {
    if (!lastRagResult || !supabaseClient) return;
    btn.disabled = true;
    btn.textContent = 'Saving…';
 
    const { error } = await supabaseClient.from('journal_entries').insert(lastRagResult);
 
    if (error) {
        console.error('Journal save failed:', error);
        btn.textContent = 'Save failed — try again';
        btn.disabled = false;
        return;
    }
    btn.textContent = '✅ Saved to journal';
    loadJournal();
}
 
async function deleteJournalEntry(id) {
    if (!confirm('Delete this journal entry?')) return;
    const { error } = await supabaseClient.from('journal_entries').delete().eq('id', id);
    if (error) alert(`Couldn't delete: ${error.message}`);
    loadJournal();
}

// ============================================
// RESULTS DISPLAY HELPERS
// ============================================

function showResults(type, html) {
    const el = document.getElementById(`${type}-results`);
    if (el) el.innerHTML = html;
}

function clearResults(type) {
    const el = document.getElementById(`${type}-results`);
    if (el) el.innerHTML = '<div class="searching">Searching...</div>';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Similarity badge with color coding
function similarityBadge(similarity) {
    const pct = (similarity * 100).toFixed(0);
    let cls;
    if (similarity >= 0.70) {
        cls = 'similarity-high';
    } else if (similarity >= 0.40) {
        cls = 'similarity-mid';
    } else {
        cls = 'similarity-low';
    }
    return `<span class="similarity-badge ${cls}">${pct}%</span>`;
}

// ============================================
// EVENT LISTENERS
// ============================================

// Keyword search
if (keywordBtn) keywordBtn.addEventListener('click', keywordSearch);
if (keywordInput) keywordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') keywordSearch();
});

// Semantic search
if (semanticBtn) semanticBtn.addEventListener('click', semanticSearch);
if (semanticInput) semanticInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') semanticSearch();
});

// RAG search
if (ragBtn) ragBtn.addEventListener('click', askQuestion);
if (ragInput) ragInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

// ============================================
// DEPLOY TIMESTAMP
// ============================================

function fetchDeployTimestamp() {
    const deployDateEl = document.getElementById('deploy-date');
    if (!deployDateEl) return;

    fetch(window.location.href, { method: 'HEAD' })
        .then(r => {
            const lastModified = r.headers.get('Last-Modified');
            if (lastModified) {
                const date = new Date(lastModified);
                deployDateEl.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            } else {
                deployDateEl.textContent = 'unknown';
            }
        })
        .catch(() => {
            deployDateEl.textContent = 'unknown';
        });
}

// ============================================
// PAGE VIEW COUNTER
// ============================================
// Demonstrates public RLS policies: this works without authentication
// because page_views has anon INSERT + SELECT policies.

function recordPageView() {
    if (!supabaseClient) return;

    const pageViewsEl = document.getElementById('page-views-count');

    // Insert a page view (best-effort, no auth required)
    supabaseClient
        .from('page_views')
        .insert({
            page_url: window.location.href,
            user_agent: navigator.userAgent
        })
        .then(() => {
            // Query the total count
            return supabaseClient
                .from('page_views')
                .select('*', { count: 'exact', head: true });
        })
        .then(({ count }) => {
            if (pageViewsEl && count != null) {
                pageViewsEl.textContent = count.toLocaleString();
            }
        })
        .catch(() => {
            // Silently fail — table might not exist yet
            if (pageViewsEl) pageViewsEl.textContent = '—';
        });
}

// ============================================
// INITIALIZE APP
// ============================================

function initializeApp() {
    if (appInitialized) return;

    initializeSupabase();

    // These always run (even without valid config)
    fetchDeployTimestamp();
    runSetupChecks();

    if (supabaseClient) {
        appInitialized = true;
        recordPageView();
        checkSession();
    }
}

// Try to initialize immediately (works if config.js has inline values)
initializeApp();

// Re-initialize when config.public.json finishes loading
window.addEventListener('config-loaded', () => {
    initializeApp();
});
