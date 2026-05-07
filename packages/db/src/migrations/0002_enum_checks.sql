ALTER TABLE organization ADD CONSTRAINT organization_environment_check CHECK (environment IN ('production','staging','sandbox'));

--> statement-breakpoint
ALTER TABLE organization ADD CONSTRAINT organization_region_check CHECK (region IN ('us-east-1','us-west-2','eu-west-1'));

--> statement-breakpoint
ALTER TABLE organization ADD CONSTRAINT organization_compliance_mode_check CHECK (compliance_mode IN ('none','hipaa','ferpa','tcpa'));

--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT user_system_role_check CHECK (system_role IN ('user','staff','superadmin'));
