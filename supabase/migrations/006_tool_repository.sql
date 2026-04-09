-- 006_tool_repository.sql
-- Tool Repository: shared tool library + per-agent tool selection

-- Available tools in the repository
CREATE TABLE public.tool_repository (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    icon TEXT DEFAULT '',
    input_schema JSONB NOT NULL DEFAULT '{}',
    is_workspace_aware BOOLEAN DEFAULT false,
    requires_google BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Which tools each agent has enabled
CREATE TABLE public.agent_tools (
    agent_id UUID NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES public.tool_repository(id) ON DELETE CASCADE,
    enabled_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (agent_id, tool_id)
);

CREATE INDEX idx_agent_tools_agent ON public.agent_tools(agent_id);
CREATE INDEX idx_tool_repository_category ON public.tool_repository(category);

ALTER TABLE public.tool_repository ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;

-- Everyone can read the tool repository
CREATE POLICY "Anyone can read tools" ON public.tool_repository FOR SELECT USING (true);

-- Users can manage their own agent's tools
CREATE POLICY "Users can read their agent tools" ON public.agent_tools FOR SELECT
    USING (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can add tools to their agent" ON public.agent_tools FOR INSERT
    WITH CHECK (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can remove tools from their agent" ON public.agent_tools FOR DELETE
    USING (agent_id IN (SELECT id FROM public.agent_profiles WHERE user_id = auth.uid()));

-- Seed all 32 tools (categories: intelligence, financial, strategy, operations, people, communication, collaboration)
INSERT INTO public.tool_repository (name, display_name, description, category, icon, is_workspace_aware, input_schema) VALUES
-- Intelligence & Research
('web_research', 'Web Research', 'Search the web, synthesize findings, and cite sources on any topic', 'intelligence', '🔍', false, '{"type":"object","properties":{"query":{"type":"string","description":"What to research"},"depth":{"type":"string","enum":["quick","thorough"],"default":"quick"}},"required":["query"]}'),
('competitor_intel', 'Competitor Intelligence', 'Research a company — financials, strategy, recent moves, leadership', 'intelligence', '🏢', false, '{"type":"object","properties":{"company":{"type":"string"},"focus":{"type":"string","enum":["overview","financials","strategy","leadership","recent_moves"],"default":"overview"}},"required":["company"]}'),
('market_sizing', 'Market Sizing', 'TAM/SAM/SOM estimation with assumptions and methodology', 'intelligence', '📊', false, '{"type":"object","properties":{"market":{"type":"string","description":"Market or product to size"},"geography":{"type":"string","default":"US"}},"required":["market"]}'),
('industry_scan', 'Industry Scan', 'Scan an industry for trends, threats, and opportunities', 'intelligence', '📡', false, '{"type":"object","properties":{"industry":{"type":"string"},"timeframe":{"type":"string","default":"current"}},"required":["industry"]}'),
('regulatory_check', 'Regulatory Check', 'Research relevant regulations and compliance requirements for a business situation', 'intelligence', '⚖️', false, '{"type":"object","properties":{"situation":{"type":"string"},"jurisdiction":{"type":"string","default":"US"}},"required":["situation"]}'),

-- Financial Analysis
('financial_model', 'Financial Model', 'Build financial models — NPV, DCF, break-even, IRR, payback period', 'financial', '💰', false, '{"type":"object","properties":{"model_type":{"type":"string","enum":["npv","dcf","break_even","irr","payback","custom"]},"inputs":{"type":"object","description":"Model inputs and assumptions"}},"required":["model_type","inputs"]}'),
('ratio_analysis', 'Ratio Analysis', 'Calculate profitability, liquidity, leverage, and efficiency ratios from financial data', 'financial', '📈', false, '{"type":"object","properties":{"financials":{"type":"object","description":"Financial statement data"},"compare_to":{"type":"string","description":"Industry or company to compare against"}},"required":["financials"]}'),
('scenario_planner', 'Scenario Planner', 'Model best/base/worst case scenarios with assumptions', 'financial', '🎯', false, '{"type":"object","properties":{"situation":{"type":"string"},"variables":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"best":{"type":"number"},"base":{"type":"number"},"worst":{"type":"number"}}}}},"required":["situation","variables"]}'),
('valuation', 'Valuation', 'Comparable company analysis, precedent transactions, rough valuations', 'financial', '🏷️', false, '{"type":"object","properties":{"company_or_asset":{"type":"string"},"method":{"type":"string","enum":["comps","precedent","dcf","multiples"],"default":"comps"},"data":{"type":"object"}},"required":["company_or_asset"]}'),
('budget_builder', 'Budget Builder', 'Build and track budgets for projects or business units', 'financial', '📋', false, '{"type":"object","properties":{"project":{"type":"string"},"timeframe":{"type":"string","default":"annual"},"line_items":{"type":"array","items":{"type":"object","properties":{"category":{"type":"string"},"amount":{"type":"number"}}}}},"required":["project"]}'),

-- Strategy
('apply_framework', 'Apply Framework', 'Apply strategic frameworks — Porter''s 5, SWOT, PESTEL, Blue Ocean, BCG, McKinsey 7S, Value Chain', 'strategy', '🧭', false, '{"type":"object","properties":{"framework":{"type":"string","enum":["porters_five","swot","pestel","blue_ocean","bcg_matrix","mckinsey_7s","value_chain","ansoff","vrio"]},"situation":{"type":"string","description":"Business situation to analyze"}},"required":["framework","situation"]}'),
('decision_matrix', 'Decision Matrix', 'Weighted scoring model for any multi-criteria decision', 'strategy', '⚡', false, '{"type":"object","properties":{"decision":{"type":"string"},"options":{"type":"array","items":{"type":"string"}},"criteria":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"weight":{"type":"number"}}}}},"required":["decision","options","criteria"]}'),
('risk_assessment', 'Risk Assessment', 'Identify, score, and prioritize risks with mitigation strategies', 'strategy', '⚠️', false, '{"type":"object","properties":{"project_or_initiative":{"type":"string"},"context":{"type":"string"}},"required":["project_or_initiative"]}'),
('stakeholder_map', 'Stakeholder Map', 'Map stakeholders by influence and interest, recommend engagement strategy', 'strategy', '🗺️', false, '{"type":"object","properties":{"initiative":{"type":"string"},"stakeholders":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"role":{"type":"string"}}}}},"required":["initiative"]}'),
('business_model_canvas', 'Business Model Canvas', 'Generate or evaluate a Business Model Canvas', 'strategy', '📐', false, '{"type":"object","properties":{"business":{"type":"string"},"mode":{"type":"string","enum":["generate","evaluate"],"default":"generate"},"existing_canvas":{"type":"object"}},"required":["business"]}'),

-- Operations
('process_map', 'Process Map', 'Map a business process, identify bottlenecks and improvements', 'operations', '🔄', false, '{"type":"object","properties":{"process_name":{"type":"string"},"current_steps":{"type":"array","items":{"type":"string"}},"pain_points":{"type":"string"}},"required":["process_name"]}'),
('project_plan', 'Project Plan', 'Break a project into phases, milestones, dependencies, and timeline', 'operations', '📅', false, '{"type":"object","properties":{"project":{"type":"string"},"constraints":{"type":"string"},"deadline":{"type":"string"}},"required":["project"]}'),
('resource_allocator', 'Resource Allocator', 'Optimize resource allocation across competing priorities', 'operations', '⚙️', false, '{"type":"object","properties":{"resources":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"capacity":{"type":"number"}}}},"demands":{"type":"array","items":{"type":"object","properties":{"project":{"type":"string"},"need":{"type":"number"},"priority":{"type":"number"}}}}},"required":["resources","demands"]}'),
('kpi_dashboard', 'KPI Dashboard', 'Define and track KPIs for a business or initiative', 'operations', '📊', false, '{"type":"object","properties":{"business_or_initiative":{"type":"string"},"goals":{"type":"array","items":{"type":"string"}}},"required":["business_or_initiative"]}'),

-- People & Leadership
('find_expertise', 'Find Expertise', 'Search the cohort for agents with relevant expertise, values, or experience', 'people', '🔎', true, '{"type":"object","properties":{"query":{"type":"string","description":"What expertise or perspective you need"},"workspace_id":{"type":"string"}},"required":["query"]}'),
('team_composition', 'Team Composition', 'Analyze a team''s Insights colors, strengths, and flag gaps in dynamics', 'people', '👥', true, '{"type":"object","properties":{"workspace_id":{"type":"string"}},"required":["workspace_id"]}'),
('negotiation_prep', 'Negotiation Prep', 'Prepare for a negotiation — BATNA, ZOPA, interests, positions, strategy', 'people', '🤝', false, '{"type":"object","properties":{"situation":{"type":"string"},"your_position":{"type":"string"},"counterparty":{"type":"string"}},"required":["situation"]}'),
('change_management', 'Change Management', 'Kotter''s 8-step, ADKAR, or force field analysis for a change initiative', 'people', '🔀', false, '{"type":"object","properties":{"initiative":{"type":"string"},"framework":{"type":"string","enum":["kotter","adkar","force_field","bridges"],"default":"kotter"},"context":{"type":"string"}},"required":["initiative"]}'),

-- Communication
('executive_summary', 'Executive Summary', 'Distill any content into a 1-page executive summary', 'communication', '📝', false, '{"type":"object","properties":{"content":{"type":"string","description":"The content to summarize"},"audience":{"type":"string","default":"senior leadership"},"max_words":{"type":"integer","default":500}},"required":["content"]}'),
('build_deck', 'Build Deck', 'Create a structured presentation outline with key messages per slide', 'communication', '🖥️', false, '{"type":"object","properties":{"topic":{"type":"string"},"audience":{"type":"string"},"num_slides":{"type":"integer","default":10},"key_message":{"type":"string"}},"required":["topic"]}'),
('critique_argument', 'Critique Argument', 'Stress-test an argument for logical gaps, weak evidence, and unsupported claims', 'communication', '🎯', false, '{"type":"object","properties":{"argument":{"type":"string"},"context":{"type":"string"}},"required":["argument"]}'),
('elevator_pitch', 'Elevator Pitch', 'Craft a 30, 60, or 90 second pitch for any idea', 'communication', '🎤', false, '{"type":"object","properties":{"idea":{"type":"string"},"duration":{"type":"string","enum":["30s","60s","90s"],"default":"60s"},"audience":{"type":"string"}},"required":["idea"]}'),
('memo_writer', 'Memo Writer', 'Draft a decision memo or position paper with recommendation', 'communication', '✍️', false, '{"type":"object","properties":{"topic":{"type":"string"},"position":{"type":"string"},"audience":{"type":"string","default":"executive team"},"supporting_data":{"type":"string"}},"required":["topic"]}'),

-- Collaboration (workspace-aware)
('summarize_workspace', 'Summarize Workspace', 'Synthesize everything discussed in a workspace into key themes and decisions', 'collaboration', '📋', true, '{"type":"object","properties":{"workspace_id":{"type":"string"},"focus":{"type":"string","description":"Optional focus area"}},"required":["workspace_id"]}'),
('identify_gaps', 'Identify Gaps', 'Analyze the knowledge graph and flag what''s missing or underexplored', 'collaboration', '🕳️', true, '{"type":"object","properties":{"workspace_id":{"type":"string"}},"required":["workspace_id"]}'),
('schedule_meeting', 'Schedule Meeting', 'Find mutual availability across workspace members', 'collaboration', '📆', true, '{"type":"object","properties":{"workspace_id":{"type":"string"},"duration_minutes":{"type":"integer","default":60},"purpose":{"type":"string"}},"required":["workspace_id"]}'),
('assign_work', 'Assign Work', 'Propose task assignments based on member expertise and availability', 'collaboration', '📌', true, '{"type":"object","properties":{"workspace_id":{"type":"string"},"work_items":{"type":"array","items":{"type":"string"}}},"required":["workspace_id","work_items"]}'),
('deadline_tracker', 'Deadline Tracker', 'Track deadlines across workspaces, flag what''s due and what''s at risk', 'collaboration', '⏰', true, '{"type":"object","properties":{"workspace_id":{"type":"string"}},"required":[]}');
