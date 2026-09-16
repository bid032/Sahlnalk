-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'SQL_ASCII';
SET standard_conforming_strings = off;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET escape_string_warning = off;
SET row_security = off;



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: account_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_type AS ENUM (
    'private',
    'shared',
    'both',
    'own'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user',
    'moderator'
);


--
-- Name: coupon_discount_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_discount_type AS ENUM (
    'percent',
    'fixed'
);


--
-- Name: coupon_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_scope AS ENUM (
    'all',
    'specific'
);


--
-- Name: delivery_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.delivery_type AS ENUM (
    'instant',
    'manual'
);


--
-- Name: order_item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_item_status AS ENUM (
    'pending',
    'delivered',
    'refunded'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'paid',
    'processing',
    'delivered',
    'cancelled',
    'refunded'
);


--
-- Name: payment_gateway; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_gateway AS ENUM (
    'paymob',
    'kashier',
    'manual',
    'wallet_instapay'
);


--
-- Name: product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_status AS ENUM (
    'active',
    'draft',
    'archived'
);


--
-- Name: admin_list_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_users() RETURNS TABLE(id uuid, display_name text, email text, created_at timestamp with time zone, has_stock_password boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id,
         p.display_name,
         u.email::text,
         p.created_at,
         (p.stock_password_hash IS NOT NULL AND p.stock_password_hash <> '') AS has_stock_password
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;


--
-- Name: admin_revenue_by_month(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_revenue_by_month() RETURNS TABLE(month date, revenue numeric, profit numeric, orders_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH per_order AS (
    SELECT
      date_trunc('month', o.created_at)::date AS m,
      o.id AS order_id,
      COALESCE(o.discount_amount, 0)::numeric AS disc,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS gross,
      COALESCE(SUM((oi.unit_price - COALESCE(pc.cost_price, 0)) * oi.quantity), 0)::numeric AS gross_profit
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.plan_costs pc ON pc.plan_id = oi.plan_id
    WHERE o.status IN ('paid','delivered','refunded')
    GROUP BY 1, o.id, o.discount_amount
  ),
  sales AS (
    SELECT m,
           SUM(GREATEST(0, gross - disc))::numeric AS rev,
           SUM(gross_profit - disc)::numeric AS gprof,
           COUNT(*)::bigint AS oc
    FROM per_order
    GROUP BY m
  ),
  refs AS (
    SELECT date_trunc('month', o.created_at)::date AS m,
           SUM(r.amount)::numeric AS ref
    FROM public.refunds r
    JOIN public.orders o ON o.id = r.order_id
    WHERE o.status IN ('paid','delivered','refunded')
    GROUP BY 1
  )
  SELECT s.m,
         COALESCE(s.rev, 0),
         (COALESCE(s.gprof, 0) - COALESCE(refs.ref, 0)),
         COALESCE(s.oc, 0)
  FROM sales s
  LEFT JOIN refs ON refs.m = s.m
  ORDER BY s.m DESC;
END;
$$;


--
-- Name: admin_revenue_stats(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_revenue_stats(_start timestamp with time zone DEFAULT NULL::timestamp with time zone, _end timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(revenue numeric, profit numeric, orders_count bigint, items_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  refund_total numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(SUM(r.amount), 0) INTO refund_total
  FROM public.refunds r
  JOIN public.orders o ON o.id = r.order_id
  WHERE o.status IN ('paid','delivered','refunded')
    AND (_start IS NULL OR o.created_at >= _start)
    AND (_end   IS NULL OR o.created_at <  _end);

  RETURN QUERY
  WITH agg AS (
    SELECT
      o.id AS order_id,
      COALESCE(o.discount_amount, 0)::numeric AS disc,
      COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric AS gross,
      COALESCE(SUM((oi.unit_price - COALESCE(pc.cost_price, 0)) * oi.quantity), 0)::numeric AS gross_profit,
      COALESCE(SUM(oi.quantity), 0)::bigint AS qty
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.plan_costs pc ON pc.plan_id = oi.plan_id
    WHERE o.status IN ('paid','delivered','refunded')
      AND (_start IS NULL OR o.created_at >= _start)
      AND (_end   IS NULL OR o.created_at <  _end)
    GROUP BY o.id, o.discount_amount
  )
  SELECT
    COALESCE(SUM(GREATEST(0, gross - disc)), 0)::numeric,
    (COALESCE(SUM(gross_profit - disc), 0) - refund_total)::numeric,
    COUNT(*)::bigint,
    COALESCE(SUM(qty), 0)::bigint
  FROM agg;
END;
$$;


--
-- Name: admin_set_stock_access(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_stock_access(_user_id uuid, _access boolean, _password text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
DECLARE
  normalized_password text := NULLIF(BTRIM(_password), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF normalized_password IS NOT NULL AND normalized_password !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'stock_password_must_be_4_digits';
  END IF;

  UPDATE public.profiles
     SET stock_access = _access,
         stock_password_hash = CASE
           WHEN normalized_password IS NULL THEN stock_password_hash
           ELSE crypt(normalized_password, gen_salt('bf', 10))
         END
   WHERE id = _user_id;
END;
$_$;


--
-- Name: admin_user_has_stock_password(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_user_has_stock_password(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT stock_password_hash IS NOT NULL AND stock_password_hash <> ''
       FROM public.profiles
      WHERE id = _user_id
        AND public.has_role(auth.uid(), 'admin')),
    false
  );
$$;


--
-- Name: claim_inventory_for_item(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_inventory_for_item(_order_item_id uuid, _plan_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  claimed_id uuid;
  claimed record;
  remaining int;
  order_owner uuid;
  order_email text;
BEGIN
  -- Ensure the caller is allowed to claim inventory for this order_item:
  -- either the order belongs to them (authenticated), or it's a guest order (user_id IS NULL).
  SELECT o.user_id, o.customer_email INTO order_owner, order_email
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = _order_item_id AND oi.plan_id = _plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order item not found';
  END IF;

  IF order_owner IS NOT NULL AND order_owner <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO claimed_id
  FROM public.account_inventory
  WHERE plan_id = _plan_id AND status = 'available'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.account_inventory
  SET status = 'delivered',
      delivered_order_item_id = _order_item_id,
      delivered_at = now()
  WHERE id = claimed_id
  RETURNING account_email, account_username, account_password, extra_notes INTO claimed;

  INSERT INTO public.delivered_accounts (order_item_id, account_email, account_username, account_password, extra_notes)
  VALUES (_order_item_id, claimed.account_email, claimed.account_username, claimed.account_password, claimed.extra_notes);

  SELECT COUNT(*) INTO remaining
  FROM public.account_inventory
  WHERE plan_id = _plan_id AND status = 'available';

  UPDATE public.product_plans SET stock = remaining WHERE id = _plan_id;

  RETURN claimed_id;
END;
$$;


--
-- Name: current_user_stock_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_stock_access() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((SELECT stock_access FROM public.profiles WHERE id = auth.uid()), false);
$$;


--
-- Name: decrement_plan_stock_on_order_item(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_plan_stock_on_order_item() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  has_inventory boolean;
BEGIN
  IF NEW.plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If plan has inventory rows, stock is managed by claim_inventory_for_item
  SELECT EXISTS(
    SELECT 1 FROM public.account_inventory WHERE plan_id = NEW.plan_id
  ) INTO has_inventory;

  IF has_inventory THEN
    RETURN NEW;
  END IF;

  UPDATE public.product_plans
  SET stock = GREATEST(0, COALESCE(stock, 0) - COALESCE(NEW.quantity, 1))
  WHERE id = NEW.plan_id;

  RETURN NEW;
END;
$$;


--
-- Name: grant_default_admin_on_confirm(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_default_admin_on_confirm() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'bidotito1@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone, country)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(BTRIM(NEW.raw_user_meta_data->>'user_name'), ''),
      NEW.email
    ),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'country'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  IF lower(NEW.email) = 'bidotito1@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;


--
-- Name: is_staff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'moderator');
$$;


--
-- Name: jsonb_diff(jsonb, jsonb, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.jsonb_diff(_old jsonb, _new jsonb, _ignore text[] DEFAULT ARRAY['updated_at'::text, 'created_at'::text]) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  k text;
  out jsonb := '{}'::jsonb;
BEGIN
  IF _old IS NULL OR _new IS NULL THEN RETURN '{}'::jsonb; END IF;
  FOR k IN SELECT jsonb_object_keys(_new) LOOP
    IF _ignore IS NOT NULL AND k = ANY(_ignore) THEN CONTINUE; END IF;
    IF (_old->k) IS DISTINCT FROM (_new->k) THEN
      out := out || jsonb_build_object(k, jsonb_build_object('from', _old->k, 'to', _new->k));
    END IF;
  END LOOP;
  -- keys removed
  FOR k IN SELECT jsonb_object_keys(_old) LOOP
    IF _ignore IS NOT NULL AND k = ANY(_ignore) THEN CONTINUE; END IF;
    IF NOT (_new ? k) THEN
      out := out || jsonb_build_object(k, jsonb_build_object('from', _old->k, 'to', null));
    END IF;
  END LOOP;
  RETURN out;
END;
$$;


--
-- Name: log_action(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_action(_action_type text, _target_type text, _target_id text, _meta jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  uid UUID := auth.uid();
  uname TEXT;
BEGIN
  IF uid IS NOT NULL THEN
    SELECT COALESCE(NULLIF(BTRIM(p.display_name), ''), u.email::text)
      INTO uname
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE p.id = uid;
  END IF;

  INSERT INTO public.audit_log(actor_id, actor_name, action_type, target_type, target_id, meta)
  VALUES (uid, uname, _action_type, _target_type, _target_id, COALESCE(_meta, '{}'::jsonb));
END;
$$;


--
-- Name: recalc_order_totals(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalc_order_totals(_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_subtotal numeric;
  disc numeric;
BEGIN
  SELECT COALESCE(SUM(unit_price * quantity), 0)::numeric
    INTO new_subtotal
  FROM public.order_items
  WHERE order_id = _order_id;

  SELECT COALESCE(discount_amount, 0) INTO disc
  FROM public.orders WHERE id = _order_id;

  UPDATE public.orders
     SET subtotal = new_subtotal,
         total    = GREATEST(0, new_subtotal - COALESCE(disc, 0))
   WHERE id = _order_id;
END;
$$;


--
-- Name: redeem_coupon(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_coupon(_coupon_id uuid, _order_id uuid, _amount numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c public.coupons%ROWTYPE;
  ord public.orders%ROWTYPE;
  uid UUID := auth.uid();
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  -- Guest orders (user_id null) allowed; authenticated must own the order or be staff
  IF ord.user_id IS NOT NULL AND uid IS DISTINCT FROM ord.user_id AND NOT public.is_staff(uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO c FROM public.coupons WHERE id = _coupon_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coupon_not_found'; END IF;

  IF NOT c.is_active THEN RAISE EXCEPTION 'coupon_inactive'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN RAISE EXCEPTION 'coupon_expired'; END IF;
  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN RAISE EXCEPTION 'coupon_exhausted'; END IF;

  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = _coupon_id;

  UPDATE public.orders
     SET coupon_id = _coupon_id,
         discount_amount = COALESCE(_amount, 0),
         total = GREATEST(0, subtotal - COALESCE(_amount, 0))
   WHERE id = _order_id;

  INSERT INTO public.coupon_redemptions(coupon_id, order_id, user_id, amount_discounted)
  VALUES (_coupon_id, _order_id, ord.user_id, COALESCE(_amount, 0));

  PERFORM public.log_action('coupon.redeemed','coupon', _coupon_id::text,
    jsonb_build_object('code', c.code, 'order_id', _order_id, 'order_number', ord.order_number, 'amount', _amount));
END;
$$;


--
-- Name: sync_plan_stock_from_inventory(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_plan_stock_from_inventory(_plan_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cnt int;
BEGIN
  IF _plan_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.account_inventory WHERE plan_id = _plan_id) THEN
    -- No inventory rows for this plan (manual delivery). Leave stock alone.
    RETURN;
  END IF;
  SELECT COUNT(*) INTO cnt
  FROM public.account_inventory
  WHERE plan_id = _plan_id AND status = 'available';
  UPDATE public.product_plans SET stock = cnt WHERE id = _plan_id;
END;
$$;


--
-- Name: tg_account_inventory_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_account_inventory_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_plan_stock_from_inventory(OLD.plan_id);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.sync_plan_stock_from_inventory(NEW.plan_id);
    RETURN NEW;
  ELSE
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      PERFORM public.sync_plan_stock_from_inventory(OLD.plan_id);
    END IF;
    PERFORM public.sync_plan_stock_from_inventory(NEW.plan_id);
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: tg_audit_category(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_category() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('category.created','category',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'slug', NEW.slug, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('category.updated','category',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'slug', NEW.slug, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('category.deleted','category',OLD.id::text,
      jsonb_build_object('name_ar', OLD.name_ar, 'slug', OLD.slug, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_coupon(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_coupon() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('coupon.created','coupon',NEW.id::text,
      jsonb_build_object('code', NEW.code, 'discount_type', NEW.discount_type,
        'discount_value', NEW.discount_value, 'applies_to', NEW.applies_to,
        'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW),
      ARRAY['updated_at','created_at','used_count']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('coupon.updated','coupon',NEW.id::text,
      jsonb_build_object('code', NEW.code, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('coupon.deleted','coupon',OLD.id::text,
      jsonb_build_object('code', OLD.code, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_delivered_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_delivered_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.log_action('delivery.manual','order_item',NEW.order_item_id::text,
    jsonb_build_object('account_email', NEW.account_email));
  RETURN NEW;
END;
$$;


--
-- Name: tg_audit_faq(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_faq() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('faq.created','faq',NEW.id::text,
      jsonb_build_object('question_ar', NEW.question_ar, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('faq.updated','faq',NEW.id::text,
      jsonb_build_object('question_ar', NEW.question_ar, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('faq.deleted','faq',OLD.id::text,
      jsonb_build_object('question_ar', OLD.question_ar, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_order_create(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_order_create() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM public.log_action('order.created','order',NEW.id::text,
    jsonb_build_object('order_number', NEW.order_number, 'status', NEW.status,
      'total', NEW.total, 'customer_email', NEW.customer_email,
      'customer_name', NEW.customer_name, 'payment_gateway', NEW.payment_gateway));
  RETURN NEW;
END;
$$;


--
-- Name: tg_audit_order_item_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_order_item_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_action(
      CASE NEW.status
        WHEN 'delivered' THEN 'order_item.delivered'
        WHEN 'refunded' THEN 'order_item.refunded'
        ELSE 'order_item.status_change'
      END,
      'order_item',
      NEW.id::text,
      jsonb_build_object(
        'from', OLD.status, 'to', NEW.status,
        'order_id', NEW.order_id,
        'product_name', NEW.product_name,
        'plan_label', NEW.plan_label
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: tg_audit_order_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_order_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_action(
      'order.status_change',
      'order',
      NEW.id::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'order_number', NEW.order_number)
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: tg_audit_plan(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_plan() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  d jsonb;
  pname text;
  ignore_arr text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name_ar INTO pname FROM public.products WHERE id = NEW.product_id;
    PERFORM public.log_action('plan.created','plan',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'product_name', pname,
        'label_ar', NEW.label_ar, 'label_en', NEW.label_en, 'price', NEW.price,
        'account_type', NEW.account_type, 'plan_variant', NEW.plan_variant,
        'stock', NEW.stock, 'is_active', NEW.is_active, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only ignore stock when the change is system-triggered (no authenticated user, e.g. sheet sync)
    IF auth.uid() IS NULL THEN
      ignore_arr := ARRAY['updated_at','created_at','stock']::text[];
    ELSE
      ignore_arr := ARRAY['updated_at','created_at']::text[];
    END IF;
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ignore_arr);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    SELECT name_ar INTO pname FROM public.products WHERE id = NEW.product_id;
    PERFORM public.log_action('plan.updated','plan',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'product_name', pname,
        'label_ar', NEW.label_ar, 'price', NEW.price, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name_ar INTO pname FROM public.products WHERE id = OLD.product_id;
    PERFORM public.log_action('plan.deleted','plan',OLD.id::text,
      jsonb_build_object('product_id', OLD.product_id, 'product_name', pname,
        'label_ar', OLD.label_ar, 'price', OLD.price, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_plan_cost(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_plan_cost() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d jsonb; pname text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.name_ar INTO pname FROM public.product_plans pp
      JOIN public.products p ON p.id = pp.product_id WHERE pp.id = NEW.plan_id;
    PERFORM public.log_action('plan_cost.updated','plan',NEW.plan_id::text,
      jsonb_build_object('product_name', pname, 'changes',
        jsonb_build_object('cost_price', jsonb_build_object('from', null, 'to', NEW.cost_price))));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.cost_price IS DISTINCT FROM NEW.cost_price THEN
      SELECT p.name_ar INTO pname FROM public.product_plans pp
        JOIN public.products p ON p.id = pp.product_id WHERE pp.id = NEW.plan_id;
      PERFORM public.log_action('plan_cost.updated','plan',NEW.plan_id::text,
        jsonb_build_object('product_name', pname, 'changes',
          jsonb_build_object('cost_price', jsonb_build_object('from', OLD.cost_price, 'to', NEW.cost_price))));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('plan_cost.deleted','plan',OLD.plan_id::text,
      jsonb_build_object('cost_price', OLD.cost_price));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_product(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_product() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('product.created','product',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'name_en', NEW.name_en, 'slug', NEW.slug,
        'status', NEW.status, 'is_featured', NEW.is_featured, 'is_bestseller', NEW.is_bestseller,
        'discount_percent', NEW.discount_percent, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW),
      ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('product.updated','product',NEW.id::text,
      jsonb_build_object('name_ar', NEW.name_ar, 'slug', NEW.slug, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('product.deleted','product',OLD.id::text,
      jsonb_build_object('name_ar', OLD.name_ar, 'name_en', OLD.name_en, 'slug', OLD.slug,
        'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_refund(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_refund() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('refund.created','refund',NEW.id::text,
      jsonb_build_object('order_id', NEW.order_id, 'order_item_id', NEW.order_item_id,
        'amount', NEW.amount, 'type', NEW.type, 'notes', NEW.notes));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('refund.updated','refund',NEW.id::text,
      jsonb_build_object('order_id', NEW.order_id, 'order_item_id', NEW.order_item_id,
        'amount', NEW.amount, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('refund.deleted','refund',OLD.id::text,
      jsonb_build_object('order_id', OLD.order_id, 'order_item_id', OLD.order_item_id,
        'amount', OLD.amount, 'type', OLD.type));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_review() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d jsonb; pname text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name_ar INTO pname FROM public.products WHERE id = NEW.product_id;
    PERFORM public.log_action('review.created','review',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'product_name', pname,
        'reviewer_name', NEW.reviewer_name, 'rating', NEW.rating, 'snapshot', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at','created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    SELECT name_ar INTO pname FROM public.products WHERE id = NEW.product_id;
    PERFORM public.log_action('review.updated','review',NEW.id::text,
      jsonb_build_object('product_id', NEW.product_id, 'product_name', pname,
        'reviewer_name', NEW.reviewer_name, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name_ar INTO pname FROM public.products WHERE id = OLD.product_id;
    PERFORM public.log_action('review.deleted','review',OLD.id::text,
      jsonb_build_object('product_id', OLD.product_id, 'product_name', pname,
        'reviewer_name', OLD.reviewer_name, 'snapshot', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_site_setting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_site_setting() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('setting.updated','setting',NEW.key,
      jsonb_build_object('key', NEW.key, 'changes',
        jsonb_build_object('value', jsonb_build_object('from', null, 'to', NEW.value))));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      PERFORM public.log_action('setting.updated','setting',NEW.key,
        jsonb_build_object('key', NEW.key, 'changes',
          jsonb_build_object('value', jsonb_build_object('from', OLD.value, 'to', NEW.value))));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('setting.deleted','setting',OLD.key,
      jsonb_build_object('key', OLD.key, 'previous_value', OLD.value));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_testimonial(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_testimonial() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE d jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('testimonial.created','testimonial',NEW.id::text,
      jsonb_build_object('image_url', NEW.image_url, 'caption', NEW.caption));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    d := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW), ARRAY['created_at']::text[]);
    IF d = '{}'::jsonb THEN RETURN NEW; END IF;
    PERFORM public.log_action('testimonial.updated','testimonial',NEW.id::text,
      jsonb_build_object('caption', NEW.caption, 'changes', d));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('testimonial.deleted','testimonial',OLD.id::text,
      jsonb_build_object('image_url', OLD.image_url, 'caption', OLD.caption));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_audit_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_audit_user_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_action('role.granted','user_role',NEW.user_id::text,
      jsonb_build_object('role', NEW.role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_action('role.revoked','user_role',OLD.user_id::text,
      jsonb_build_object('role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: tg_recalc_order_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_recalc_order_totals() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_order_totals(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_order_totals(NEW.order_id);
    RETURN NEW;
  END IF;
END;
$$;


--
-- Name: tg_sync_order_status_from_items(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_sync_order_status_from_items() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  total_cnt int;
  delivered_cnt int;
  cur_status public.order_status;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'delivered')
    INTO total_cnt, delivered_cnt
  FROM public.order_items
  WHERE order_id = COALESCE(NEW.order_id, OLD.order_id);

  IF total_cnt = 0 THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT status INTO cur_status FROM public.orders
   WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  IF delivered_cnt = total_cnt AND cur_status IS DISTINCT FROM 'delivered' AND cur_status <> 'refunded' THEN
    UPDATE public.orders SET status = 'delivered'
     WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: tg_validate_order_item_price(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_validate_order_item_price() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  plan_price numeric;
  plan_discount numeric;
  expected numeric;
BEGIN
  IF NEW.plan_id IS NULL THEN RETURN NEW; END IF;

  SELECT pp.price, COALESCE(p.discount_percent, 0)
    INTO plan_price, plan_discount
  FROM public.product_plans pp
  LEFT JOIN public.products p ON p.id = pp.product_id
  WHERE pp.id = NEW.plan_id;

  IF plan_price IS NULL THEN
    RAISE EXCEPTION 'invalid_plan_id';
  END IF;

  expected := ROUND((plan_price * (100 - plan_discount) / 100)::numeric, 2);

  IF ABS(COALESCE(NEW.unit_price, 0) - expected) > 1 THEN
    RAISE EXCEPTION 'unit_price_mismatch: expected % got %', expected, NEW.unit_price;
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: validate_coupon(text, numeric, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_coupon(_code text, _subtotal numeric, _product_ids uuid[]) RETURNS TABLE(valid boolean, message text, coupon_id uuid, code text, discount numeric, discount_type text, discount_value numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c public.coupons%ROWTYPE;
  eligible_subtotal NUMERIC := 0;
  calc_discount NUMERIC := 0;
BEGIN
  SELECT * INTO c FROM public.coupons AS co WHERE upper(co.code) = upper(BTRIM(_code)) LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'كود غير صحيح'::text, NULL::uuid, NULL::text, 0::numeric, NULL::text, 0::numeric;
    RETURN;
  END IF;

  IF NOT c.is_active THEN
    RETURN QUERY SELECT false, 'الكود غير مفعّل'::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
    RETURN;
  END IF;

  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN QUERY SELECT false, 'انتهت صلاحية الكود'::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
    RETURN;
  END IF;

  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN QUERY SELECT false, 'تم استنفاد استخدامات الكود'::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
    RETURN;
  END IF;

  IF c.min_order_amount IS NOT NULL AND _subtotal < c.min_order_amount THEN
    RETURN QUERY SELECT false, ('الحد الأدنى للطلب ' || c.min_order_amount::text)::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
    RETURN;
  END IF;

  IF c.applies_to = 'all' THEN
    eligible_subtotal := _subtotal;
  ELSE
    SELECT COALESCE(SUM(t.line_total), 0) INTO eligible_subtotal
    FROM unnest(_product_ids) WITH ORDINALITY AS u(pid, ord)
    JOIN LATERAL (
      SELECT (
        SELECT (pp.price * (100 - COALESCE(p.discount_percent, 0)) / 100)
        FROM public.products p
        JOIN public.product_plans pp ON pp.product_id = p.id
        WHERE p.id = u.pid
        ORDER BY pp.price ASC
        LIMIT 1
      ) AS line_total
    ) t ON true
    WHERE u.pid = ANY(c.product_ids);
    IF eligible_subtotal <= 0 THEN
      RETURN QUERY SELECT false, 'الكود لا ينطبق على هذه الخدمات'::text, c.id, c.code, 0::numeric, c.discount_type::text, c.discount_value;
      RETURN;
    END IF;
    IF eligible_subtotal > _subtotal THEN eligible_subtotal := _subtotal; END IF;
  END IF;

  IF c.discount_type = 'percent' THEN
    calc_discount := ROUND(eligible_subtotal * c.discount_value / 100, 2);
  ELSE
    calc_discount := LEAST(c.discount_value, eligible_subtotal);
  END IF;

  IF calc_discount > _subtotal THEN calc_discount := _subtotal; END IF;
  IF calc_discount < 0 THEN calc_discount := 0; END IF;

  RETURN QUERY SELECT true, 'ok'::text, c.id, c.code, calc_discount, c.discount_type::text, c.discount_value;
END;
$$;


--
-- Name: verify_stock_password(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_stock_password(_password text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  h text;
  ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT stock_password_hash INTO h FROM public.profiles
   WHERE id = auth.uid() AND stock_access = true;
  IF h IS NULL THEN RETURN false; END IF;
  SELECT (crypt(_password, h) = h) INTO ok;
  RETURN COALESCE(ok, false);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    account_email text,
    account_username text,
    account_password text,
    extra_notes text,
    status text DEFAULT 'available'::text NOT NULL,
    delivered_order_item_id uuid,
    delivered_at timestamp with time zone,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    import_batch_id uuid,
    spreadsheet_id text,
    sheet_title text,
    sheet_row_index integer,
    status_column_letter text,
    CONSTRAINT account_inventory_status_check CHECK ((status = ANY (ARRAY['available'::text, 'delivered'::text])))
);

ALTER TABLE ONLY public.account_inventory REPLICA IDENTITY FULL;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    actor_name text,
    action_type text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.audit_log REPLICA IDENTITY FULL;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name_ar text NOT NULL,
    name_en text NOT NULL,
    description_ar text,
    description_en text,
    icon text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.categories REPLICA IDENTITY FULL;


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    order_id uuid,
    user_id uuid,
    amount_discounted numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.coupon_redemptions REPLICA IDENTITY FULL;


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    discount_type public.coupon_discount_type DEFAULT 'percent'::public.coupon_discount_type NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    min_order_amount numeric(10,2),
    applies_to public.coupon_scope DEFAULT 'all'::public.coupon_scope NOT NULL,
    product_ids uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupons_discount_value_check CHECK ((discount_value > (0)::numeric))
);

ALTER TABLE ONLY public.coupons REPLICA IDENTITY FULL;


--
-- Name: delivered_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivered_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_item_id uuid NOT NULL,
    account_email text,
    account_username text,
    account_password text,
    extra_notes text,
    delivered_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_by uuid
);

ALTER TABLE ONLY public.delivered_accounts REPLICA IDENTITY FULL;


--
-- Name: faqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_ar text NOT NULL,
    question_en text NOT NULL,
    answer_ar text NOT NULL,
    answer_en text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.faqs REPLICA IDENTITY FULL;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    plan_id uuid,
    product_name text NOT NULL,
    plan_label text NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    delivery_type public.delivery_type NOT NULL,
    account_type public.account_type NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subscription_email text,
    status public.order_item_status DEFAULT 'pending'::public.order_item_status NOT NULL
);

ALTER TABLE ONLY public.order_items REPLICA IDENTITY FULL;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    order_number text DEFAULT ('RK-'::text || upper("substring"((gen_random_uuid())::text, 1, 8))) NOT NULL,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    payment_gateway public.payment_gateway,
    payment_reference text,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'EGP'::text NOT NULL,
    customer_email text,
    customer_phone text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_proof_url text,
    payment_sender_phone text,
    customer_name text,
    coupon_id uuid,
    discount_amount numeric(10,2) DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.orders REPLICA IDENTITY FULL;


--
-- Name: plan_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_costs (
    plan_id uuid NOT NULL,
    cost_price numeric(10,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.plan_costs REPLICA IDENTITY FULL;


--
-- Name: product_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    label_ar text NOT NULL,
    label_en text NOT NULL,
    duration_days integer,
    price numeric(10,2) NOT NULL,
    compare_price numeric(10,2),
    stock integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sheet_csv_url text,
    account_type public.account_type,
    plan_variant text
);

ALTER TABLE ONLY public.product_plans REPLICA IDENTITY FULL;


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    reviewer_name text NOT NULL,
    rating smallint NOT NULL,
    body text NOT NULL,
    lang text DEFAULT 'ar'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_reviews_lang_check CHECK ((lang = ANY (ARRAY['ar'::text, 'en'::text]))),
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

ALTER TABLE ONLY public.product_reviews REPLICA IDENTITY FULL;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    slug text NOT NULL,
    name_ar text NOT NULL,
    name_en text NOT NULL,
    description_ar text,
    description_en text,
    icon_url text,
    cover_url text,
    delivery_type public.delivery_type DEFAULT 'instant'::public.delivery_type NOT NULL,
    account_type public.account_type DEFAULT 'private'::public.account_type NOT NULL,
    status public.product_status DEFAULT 'active'::public.product_status NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    discount_percent smallint DEFAULT 0 NOT NULL,
    account_types public.account_type[] DEFAULT '{}'::public.account_type[] NOT NULL,
    google_spreadsheet_id text,
    category_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    is_bestseller boolean DEFAULT false NOT NULL,
    plan_variants text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT products_discount_percent_check CHECK (((discount_percent >= 0) AND (discount_percent <= 95)))
);

ALTER TABLE ONLY public.products REPLICA IDENTITY FULL;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    phone text,
    avatar_url text,
    preferred_language text DEFAULT 'ar'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    country text,
    stock_access boolean DEFAULT false NOT NULL,
    stock_password_hash text
);

ALTER TABLE ONLY public.profiles REPLICA IDENTITY FULL;


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    order_id uuid,
    amount numeric NOT NULL,
    type text NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    order_item_id uuid,
    CONSTRAINT refunds_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT refunds_type_check CHECK ((type = ANY (ARRAY['full'::text, 'partial'::text, 'replacement'::text])))
);

ALTER TABLE ONLY public.refunds REPLICA IDENTITY FULL;


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.site_settings REPLICA IDENTITY FULL;


--
-- Name: testimonial_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonial_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_url text NOT NULL,
    caption text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.testimonial_images REPLICA IDENTITY FULL;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.user_roles REPLICA IDENTITY FULL;


--
-- Name: account_inventory account_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_inventory
    ADD CONSTRAINT account_inventory_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: delivered_accounts delivered_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivered_accounts
    ADD CONSTRAINT delivered_accounts_pkey PRIMARY KEY (id);


--
-- Name: faqs faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT faqs_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: plan_costs plan_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_costs
    ADD CONSTRAINT plan_costs_pkey PRIMARY KEY (plan_id);


--
-- Name: product_plans product_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_plans
    ADD CONSTRAINT product_plans_pkey PRIMARY KEY (id);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (key);


--
-- Name: testimonial_images testimonial_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonial_images
    ADD CONSTRAINT testimonial_images_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: account_inventory_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_inventory_batch_idx ON public.account_inventory USING btree (plan_id, import_batch_id);


--
-- Name: account_inventory_plan_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_inventory_plan_status_idx ON public.account_inventory USING btree (plan_id, status);


--
-- Name: coupon_redemptions_coupon_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupon_redemptions_coupon_idx ON public.coupon_redemptions USING btree (coupon_id);


--
-- Name: coupon_redemptions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupon_redemptions_order_idx ON public.coupon_redemptions USING btree (order_id);


--
-- Name: coupons_code_upper_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupons_code_upper_idx ON public.coupons USING btree (upper(code));


--
-- Name: idx_audit_log_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_actor ON public.audit_log USING btree (actor_id);


--
-- Name: idx_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_log_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_target ON public.audit_log USING btree (target_type, target_id);


--
-- Name: idx_products_is_bestseller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_is_bestseller ON public.products USING btree (is_bestseller) WHERE (is_bestseller = true);


--
-- Name: order_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_order_idx ON public.order_items USING btree (order_id);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);


--
-- Name: orders_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_user_idx ON public.orders USING btree (user_id);


--
-- Name: plans_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plans_product_idx ON public.product_plans USING btree (product_id);


--
-- Name: product_reviews_product_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_product_active_idx ON public.product_reviews USING btree (product_id, is_active, sort_order);


--
-- Name: products_category_ids_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_category_ids_gin ON public.products USING gin (category_ids);


--
-- Name: products_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_category_idx ON public.products USING btree (category_id);


--
-- Name: refunds_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refunds_order_id_idx ON public.refunds USING btree (order_id);


--
-- Name: refunds_order_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refunds_order_item_id_idx ON public.refunds USING btree (order_item_id);


--
-- Name: account_inventory account_inventory_sync_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER account_inventory_sync_stock AFTER INSERT OR DELETE OR UPDATE ON public.account_inventory FOR EACH ROW EXECUTE FUNCTION public.tg_account_inventory_sync();


--
-- Name: categories categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: faqs faqs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER faqs_updated_at BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_plans plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.product_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_reviews product_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_reviews_updated_at BEFORE UPDATE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: refunds refunds_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refunds_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: categories trg_audit_category; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_category AFTER INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.tg_audit_category();


--
-- Name: coupons trg_audit_coupon; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_coupon AFTER INSERT OR DELETE OR UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.tg_audit_coupon();


--
-- Name: delivered_accounts trg_audit_delivered_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_delivered_account AFTER INSERT ON public.delivered_accounts FOR EACH ROW EXECUTE FUNCTION public.tg_audit_delivered_account();


--
-- Name: faqs trg_audit_faq; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_faq AFTER INSERT OR DELETE OR UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.tg_audit_faq();


--
-- Name: orders trg_audit_order_create; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_order_create AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.tg_audit_order_create();


--
-- Name: order_items trg_audit_order_item_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_order_item_status AFTER UPDATE OF status ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.tg_audit_order_item_status();


--
-- Name: orders trg_audit_order_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_order_status AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.tg_audit_order_status();


--
-- Name: product_plans trg_audit_plan; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_plan AFTER INSERT OR DELETE OR UPDATE ON public.product_plans FOR EACH ROW EXECUTE FUNCTION public.tg_audit_plan();


--
-- Name: plan_costs trg_audit_plan_cost; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_plan_cost AFTER INSERT OR DELETE OR UPDATE ON public.plan_costs FOR EACH ROW EXECUTE FUNCTION public.tg_audit_plan_cost();


--
-- Name: products trg_audit_product; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_product AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.tg_audit_product();


--
-- Name: refunds trg_audit_refund; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_refund AFTER INSERT OR DELETE OR UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.tg_audit_refund();


--
-- Name: product_reviews trg_audit_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_review AFTER INSERT OR DELETE OR UPDATE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.tg_audit_review();


--
-- Name: site_settings trg_audit_site_setting; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_site_setting AFTER INSERT OR DELETE OR UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.tg_audit_site_setting();


--
-- Name: testimonial_images trg_audit_testimonial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_testimonial AFTER INSERT OR DELETE OR UPDATE ON public.testimonial_images FOR EACH ROW EXECUTE FUNCTION public.tg_audit_testimonial();


--
-- Name: user_roles trg_audit_user_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_user_role AFTER INSERT OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.tg_audit_user_role();


--
-- Name: coupons trg_coupons_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: order_items trg_decrement_plan_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_decrement_plan_stock AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.decrement_plan_stock_on_order_item();


--
-- Name: order_items trg_order_items_recalc; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_items_recalc AFTER INSERT OR DELETE OR UPDATE OF unit_price, quantity ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_order_totals();


--
-- Name: order_items trg_sync_order_status_from_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_order_status_from_items AFTER INSERT OR UPDATE OF status ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.tg_sync_order_status_from_items();


--
-- Name: order_items validate_order_item_price; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_order_item_price BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.tg_validate_order_item_price();


--
-- Name: account_inventory account_inventory_delivered_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_inventory
    ADD CONSTRAINT account_inventory_delivered_order_item_id_fkey FOREIGN KEY (delivered_order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;


--
-- Name: account_inventory account_inventory_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_inventory
    ADD CONSTRAINT account_inventory_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.product_plans(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: coupon_redemptions coupon_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: coupons coupons_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: delivered_accounts delivered_accounts_delivered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivered_accounts
    ADD CONSTRAINT delivered_accounts_delivered_by_fkey FOREIGN KEY (delivered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: delivered_accounts delivered_accounts_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivered_accounts
    ADD CONSTRAINT delivered_accounts_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.product_plans(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: orders orders_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE SET NULL;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: plan_costs plan_costs_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_costs
    ADD CONSTRAINT plan_costs_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.product_plans(id) ON DELETE CASCADE;


--
-- Name: product_plans product_plans_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_plans
    ADD CONSTRAINT product_plans_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: refunds refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: audit_log Admin can delete audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can delete audit log" ON public.audit_log FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: product_reviews Admins can delete reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete reviews" ON public.product_reviews FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: product_reviews Admins can insert reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert reviews" ON public.product_reviews FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: product_reviews Admins can update reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update reviews" ON public.product_reviews FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: product_reviews Admins can view all reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all reviews" ON public.product_reviews FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: product_plans Admins manage plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage plans" ON public.product_plans TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_settings Admins manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage settings" ON public.site_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: orders Admins update orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update orders" ON public.orders FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: profiles Admins view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: orders Anon create guest orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon create guest orders" ON public.orders FOR INSERT TO anon WITH CHECK (((user_id IS NULL) AND (customer_email IS NOT NULL)));


--
-- Name: order_items Anon insert guest order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon insert guest order items" ON public.order_items FOR INSERT TO anon WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.user_id IS NULL)))));


--
-- Name: categories Anyone views active categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone views active categories" ON public.categories FOR SELECT USING (((is_active = true) OR public.is_staff(auth.uid())));


--
-- Name: product_plans Anyone views active plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone views active plans" ON public.product_plans FOR SELECT USING (((is_active = true) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: product_plans Anyone views active product plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone views active product plans" ON public.product_plans FOR SELECT USING (((is_active = true) OR public.is_staff(auth.uid())));


--
-- Name: products Anyone views active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone views active products" ON public.products FOR SELECT USING (((status = 'active'::public.product_status) OR public.is_staff(auth.uid())));


--
-- Name: coupon_redemptions Block direct inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Block direct inserts" ON public.coupon_redemptions FOR INSERT WITH CHECK (false);


--
-- Name: site_settings Moderators view settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moderators view settings" ON public.site_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'moderator'::public.app_role));


--
-- Name: audit_log Nobody can insert directly; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Nobody can insert directly" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: product_reviews Public can view active reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active reviews" ON public.product_reviews FOR SELECT USING ((is_active = true));


--
-- Name: site_settings Public views safe settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public views safe settings" ON public.site_settings FOR SELECT USING ((key = ANY (ARRAY['brand'::text, 'contact'::text, 'payments'::text, 'checkout'::text, 'hero'::text, 'socials'::text, 'stats'::text, 'theme_mode'::text])));


--
-- Name: audit_log Staff can view audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view audit log" ON public.audit_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: order_items Staff delete order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete order items" ON public.order_items FOR DELETE USING (public.is_staff(auth.uid()));


--
-- Name: orders Staff delete orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff delete orders" ON public.orders FOR DELETE USING (public.is_staff(auth.uid()));


--
-- Name: account_inventory Staff manage account inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage account inventory" ON public.account_inventory USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: categories Staff manage categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage categories" ON public.categories USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: coupons Staff manage coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage coupons" ON public.coupons USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: delivered_accounts Staff manage delivered accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage delivered accounts" ON public.delivered_accounts USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: plan_costs Staff manage plan costs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage plan costs" ON public.plan_costs USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: product_plans Staff manage product plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage product plans" ON public.product_plans USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: product_reviews Staff manage product reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage product reviews" ON public.product_reviews USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: products Staff manage products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage products" ON public.products USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: refunds Staff manage refunds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage refunds" ON public.refunds USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: testimonial_images Staff manage testimonial images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff manage testimonial images" ON public.testimonial_images USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: order_items Staff update order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update order items" ON public.order_items FOR UPDATE USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: orders Staff update orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff update orders" ON public.orders FOR UPDATE USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: order_items Staff view all order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view all order items" ON public.order_items FOR SELECT USING (public.is_staff(auth.uid()));


--
-- Name: orders Staff view all orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view all orders" ON public.orders FOR SELECT USING (public.is_staff(auth.uid()));


--
-- Name: coupons Staff view coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view coupons" ON public.coupons FOR SELECT USING (public.is_staff(auth.uid()));


--
-- Name: coupon_redemptions Staff view redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff view redemptions" ON public.coupon_redemptions FOR SELECT USING (public.is_staff(auth.uid()));


--
-- Name: orders Users create own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users create own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: order_items Users insert own order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own order items" ON public.order_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.user_id = auth.uid())))));


--
-- Name: profiles Users insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Users update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--
-- Name: delivered_accounts Users view own delivered accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own delivered accounts" ON public.delivered_accounts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.order_items oi
     JOIN public.orders o ON ((o.id = oi.order_id)))
  WHERE ((oi.id = delivered_accounts.order_item_id) AND ((o.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role))))));


--
-- Name: account_inventory Users view own delivered inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own delivered inventory" ON public.account_inventory FOR SELECT TO authenticated USING (((delivered_order_item_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.order_items oi
     JOIN public.orders o ON ((o.id = oi.order_id)))
  WHERE ((oi.id = account_inventory.delivered_order_item_id) AND (o.user_id = auth.uid()))))));


--
-- Name: order_items Users view own order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own order items" ON public.order_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role))))));


--
-- Name: orders Users view own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own orders" ON public.orders FOR SELECT USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: profiles Users view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: coupon_redemptions Users view own redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own redemptions" ON public.coupon_redemptions FOR SELECT USING (((user_id IS NOT NULL) AND (user_id = auth.uid())));


--
-- Name: user_roles Users view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: account_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: delivered_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivered_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: faqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

--
-- Name: faqs faqs admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "faqs admin delete" ON public.faqs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: faqs faqs admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "faqs admin insert" ON public.faqs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: faqs faqs admin read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "faqs admin read all" ON public.faqs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: faqs faqs admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "faqs admin update" ON public.faqs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: faqs faqs public read active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "faqs public read active" ON public.faqs FOR SELECT USING ((is_active = true));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: product_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: product_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds refunds staff delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "refunds staff delete" ON public.refunds FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: refunds refunds staff insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "refunds staff insert" ON public.refunds FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: refunds refunds staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "refunds staff read" ON public.refunds FOR SELECT USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: refunds refunds staff update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "refunds staff update" ON public.refunds FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role)));


--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: testimonial_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testimonial_images ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

