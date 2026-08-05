export {};
const pool = require('../db');

async function fixTriggers() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Creating SPES2_recalculate_session_final_score function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION SPES2_recalculate_session_final_score()
      RETURNS TRIGGER AS $$
      DECLARE
        v_session_id  UUID;
        v_user_score  DECIMAL;
        v_gcp_score   DECIMAL;
        v_final       DECIMAL;
        v_grade       VARCHAR(5);
      BEGIN
        v_session_id := NEW.session_id;

        SELECT total_score INTO v_user_score
          FROM "SPES2_evaluations"
         WHERE session_id = v_session_id AND role = 'USER' AND status = 'saved';

        SELECT total_score INTO v_gcp_score
          FROM "SPES2_evaluations"
         WHERE session_id = v_session_id AND role = 'GCP' AND status = 'saved';

        IF v_user_score IS NOT NULL AND v_gcp_score IS NOT NULL THEN
          v_final := ROUND((v_user_score + v_gcp_score) / 2.0, 2);

          SELECT grade INTO v_grade
            FROM "SPES2_grade_thresholds"
           WHERE ROUND(v_final, 1) >= min_score AND ROUND(v_final, 1) <= max_score
           LIMIT 1;

          UPDATE "SPES2_evaluation_sessions"
             SET final_score = v_final,
                 final_grade = v_grade,
                 status      = 'pending_review'
           WHERE id = v_session_id AND status != 'completed';
        ELSE
          UPDATE "SPES2_evaluation_sessions"
             SET status = 'in_progress'
           WHERE id = v_session_id AND status IN ('pending', 'returned');
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('Attaching triggers to SPES tables...');
    const triggerQueries = [
      'DROP TRIGGER IF EXISTS SPES2_trg_recalculate_score ON "SPES2_evaluations";',
      'CREATE TRIGGER SPES2_trg_recalculate_score AFTER INSERT OR UPDATE ON "SPES2_evaluations" FOR EACH ROW EXECUTE FUNCTION SPES2_recalculate_session_final_score();',
      
      'DROP TRIGGER IF EXISTS SPES2_trg_sessions_updated_at ON "SPES2_evaluation_sessions";',
      'CREATE TRIGGER SPES2_trg_sessions_updated_at BEFORE UPDATE ON "SPES2_evaluation_sessions" FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      
      'DROP TRIGGER IF EXISTS SPES2_trg_evaluations_updated_at ON "SPES2_evaluations";',
      'CREATE TRIGGER SPES2_trg_evaluations_updated_at BEFORE UPDATE ON "SPES2_evaluations" FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      
      'DROP TRIGGER IF EXISTS SPES2_trg_scores_updated_at ON "SPES2_evaluation_scores";',
      'CREATE TRIGGER SPES2_trg_scores_updated_at BEFORE UPDATE ON "SPES2_evaluation_scores" FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      
      'DROP TRIGGER IF EXISTS SPES2_trg_suppliers_updated_at ON "SPES2_suppliers";',
      'CREATE TRIGGER SPES2_trg_suppliers_updated_at BEFORE UPDATE ON "SPES2_suppliers" FOR EACH ROW EXECUTE FUNCTION update_updated_at();'
    ];

    for (const q of triggerQueries) {
      await client.query(q);
    }
    
    await client.query('COMMIT');
    console.log('Successfully fixed triggers!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

fixTriggers();
