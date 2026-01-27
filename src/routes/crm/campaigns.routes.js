const router = require('express').Router();
const { createClient } = require('@supabase/supabase-js');
// const whatsapp = require('../../whatsapp/client');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Campaigns ---

// Create a new campaign
router.post('/', async (req, res) => {
    try {
        const { name, channel_id, audience_filter, send_window, rate_limit, created_by, steps } = req.body;

        // 1. Create campaign
        const { data: campaign, error: campError } = await supabase
            .from('campaigns')
            .insert([{
                name, channel_id, audience_filter, send_window, rate_limit, created_by, status: 'draft'
            }])
            .select()
            .single();

        if (campError) throw campError;

        // 2. Create steps
        if (steps && steps.length > 0) {
            const stepsToInsert = steps.map((s, i) => ({
                campaign_id: campaign.id,
                step_order: i + 1,
                delay_minutes: s.delay_minutes || 0,
                type: s.type || 'text',
                template_body: s.template_body,
                media_url: s.media_url
            }));

            const { error: stepsError } = await supabase
                .from('campaign_steps')
                .insert(stepsToInsert);

            if (stepsError) throw stepsError;
        }

        res.json({ success: true, data: campaign });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Launch campaign (Generate Recipients)
router.post('/:id/launch', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Fetch campaign
        const { data: campaign, error: campError } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .single();

        if (campError) throw campError;

        // 2. Build audience query (simplified for now: all customers with status 'lead' or 'customer')
        let query = supabase.from('customers').select('id, tags');
        
        // Apply simple status filter if present
        if (campaign.audience_filter?.status && campaign.audience_filter.status !== 'all') {
            query = query.eq('status', campaign.audience_filter.status);
        }

        // Apply tags filter if present (using array overlap)
        if (campaign.audience_filter?.tags && campaign.audience_filter.tags.length > 0) {
            // "tags" column in Supabase is text[]
            // We want customers who have ANY of the selected tags
            // Use overlaps operator (&&)
            // Note: Supabase JS syntax for array overlaps is .cs() (contains) or .ov() (overlaps)?
            // Actually .overlaps() checks if array columns have common elements
            query = query.overlaps('tags', campaign.audience_filter.tags);
        }

        const { data: customers, error: custError } = await query;
        if (custError) throw custError;

        // 3. Insert recipients
        const recipients = customers.map(c => ({
            campaign_id: id,
            customer_id: c.id,
            status: 'queued',
            next_run_at: new Date() // Scheduled for now (or apply send_window logic)
        }));

        if (recipients.length > 0) {
            const { error: recError } = await supabase
                .from('campaign_recipients')
                .insert(recipients)
                .onConflict('campaign_id, customer_id') // Avoid dupes
                .ignore();
            
            if (recError) throw recError;
        }

        // 4. Update campaign status
        await supabase
            .from('campaigns')
            .update({ status: 'running' })
            .eq('id', id);

        res.json({ success: true, message: `Campaign launched with ${recipients.length} recipients queued.` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get campaign stats
router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Simple counts
        const { count: total } = await supabase.from('campaign_recipients').select('*', { count: 'exact', head: true }).eq('campaign_id', id);
        const { count: sent } = await supabase.from('campaign_recipients').select('*', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'sent');
        const { count: failed } = await supabase.from('campaign_recipients').select('*', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'failed');
        const { count: queued } = await supabase.from('campaign_recipients').select('*', { count: 'exact', head: true }).eq('campaign_id', id).eq('status', 'queued');

        res.json({
            success: true,
            stats: { total, sent, failed, queued }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
