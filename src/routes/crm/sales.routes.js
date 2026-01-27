const router = require('express').Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Pipelines ---

// Get all pipelines with stages
router.get('/pipelines', async (req, res) => {
    try {
        const { data: pipelines, error } = await supabase
            .from('pipelines')
            .select(`
                *,
                stages:pipeline_stages(*)
            `)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Sort stages by order
        pipelines.forEach(p => {
            if (p.stages) p.stages.sort((a, b) => a.stage_order - b.stage_order);
        });

        res.json({ success: true, data: pipelines });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Deals ---

// Create a new deal
router.post('/deals', async (req, res) => {
    try {
        const { title, customer_id, pipeline_id, stage_id, amount, currency, expected_close_at, owner_id } = req.body;

        const { data, error } = await supabase
            .from('deals')
            .insert([{
                title, customer_id, pipeline_id, stage_id, amount, currency, expected_close_at, owner_id
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Move deal to another stage
router.post('/deals/:id/move-stage', async (req, res) => {
    try {
        const { id } = req.params;
        const { stage_id, status, lost_reason } = req.body;

        const updates = { stage_id };
        if (status) updates.status = status;
        if (status === 'won') updates.won_at = new Date();
        if (status === 'lost') {
            updates.lost_at = new Date();
            updates.lost_reason = lost_reason;
        }

        const { data, error } = await supabase
            .from('deals')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Activities ---

// Get activities for a customer or deal
router.get('/activities', async (req, res) => {
    try {
        const { customer_id, deal_id } = req.query;
        let query = supabase.from('activities').select('*').order('created_at', { ascending: false });

        if (customer_id) query = query.eq('customer_id', customer_id);
        if (deal_id) query = query.eq('deal_id', deal_id);

        const { data, error } = await query;
        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create activity
router.post('/activities', async (req, res) => {
    try {
        const { customer_id, deal_id, type, title, description, due_at, owner_id } = req.body;

        const { data, error } = await supabase
            .from('activities')
            .insert([{
                customer_id, deal_id, type, title, description, due_at, owner_id
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
