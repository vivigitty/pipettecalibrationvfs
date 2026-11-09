BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vfl_app') THEN CREATE ROLE vfl_app NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO vfl_app;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO vfl_app;
REVOKE UPDATE,DELETE,TRUNCATE ON audit_logs FROM vfl_app;
REVOKE DELETE,TRUNCATE ON ALL TABLES IN SCHEMA public FROM vfl_app;
REVOKE ALL ON FUNCTION touch_updated_at(),reject_delete(),reject_audit_mutation(),protect_completed_session(),protect_session_child(),certificate_gate() FROM PUBLIC;
COMMIT;