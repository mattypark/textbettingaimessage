-- 0012_pay_handles: where a member wants to be paid when a social stake
-- settles. Mushy posts links that open the payer's own app; it never holds,
-- moves or charges money. Shape: {"venmo": "matt", "cashapp": "matt", ...}.

alter table users add column pay_handles jsonb not null default '{}'::jsonb;
