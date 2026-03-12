import { supabase } from '../lib/supabase';
import { Client } from '../types';

export const EmailService = {
  // Check if a client has a valid email in the main field or in client_emails
  hasEmail: async (clientId: string): Promise<boolean> => {
    try {
      // Check main client record first
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .select('email')
        .eq('id', clientId)
        .single();
        
      if (!clientErr && clientData?.email && clientData.email.trim() !== '') {
        return true;
      }

      // Check secondary table
      const { count, error: secErr } = await supabase
        .from('client_emails')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId);

      if (!secErr && count && count > 0) {
        return true;
      }

      return false;
    } catch (e) {
      console.error('Error checking email coverage:', e);
      return false;
    }
  },

  saveEmail: async (clientId: string, email: string, operatorId?: string): Promise<void> => {
    if (!email || email.trim() === '') return;

    try {
      // 1. Save to primary client record if empty
      const { data: clientData } = await supabase
        .from('clients')
        .select('email')
        .eq('id', clientId)
        .single();

      if (clientData && (!clientData.email || clientData.email.trim() === '')) {
        await supabase
          .from('clients')
          .update({ email: email.trim() })
          .eq('id', clientId);
      }

      // 2. Add to client_emails tracking table via RPC or direct insert (handling unique constraints)
      const payload = {
        client_id: clientId,
        email: email.trim(),
        origem: 'DIRETA',
        criado_por: operatorId
      };

      // Upsert into client_emails
      await supabase
        .from('client_emails')
        .upsert([payload], { onConflict: 'client_id,email' });

    } catch (e) {
      console.error('Error saving email:', e);
    }
  },
  
  getCoverageStats: async (): Promise<{ total: number; withEmail: number; coveragePercent: number }> => {
    try {
      const { data, error } = await supabase
        .from('cobertura_email')
        .select('*')
        .single();
        
      if (error) throw error;
      
      return {
        total: data.total_clientes,
        withEmail: data.com_email,
        coveragePercent: data.percentual_cobertura
      };
    } catch (e) {
      console.error('Error fetching email coverage stats:', e);
      return { total: 0, withEmail: 0, coveragePercent: 0 };
    }
  }
};
