---
template_id: all_in_repricing_notice_v3
from: "Maporia <hello@maporia.co>"
reply_to: "hello@maporia.co"
subject: "Good news — your Maporia Pro All-in is now $19.99/mo"
audience: "Active Pro All-in subscribers on the v2 $34.99 price (lookup_keys maporia_pro_all_month / _year)"
status: ready_to_send
---

# Subject

Good news — your Maporia Pro All-in is now $19.99/mo

# Plain-text body

Hi {{first_name|there}},

Quick update on your Maporia Pro All-in subscription.

We've restructured our plans: Pro All-in is now $19.99/month (down from $34.99) and $191.88/year (down from $335.88). We've already switched your subscription over — there's nothing for you to do.

Your next bill will reflect the new price. We didn't issue a credit for the current period; if that's something you'd like, just reply to this email and we'll sort it out.

What stays the same:
- 10 listings combined (locations + services + experiences)
- Premium access included
- Everything else you already get

Why we're doing this: we also launched Pro Creator ($14.99/mo) for service- or experience-only sellers. At $34.99 Pro All-in didn't make math sense next to the pieces — so we brought it down.

If you have any questions, just reply.

— Artem
Maporia
https://maporia.co

# HTML body

<p>Hi {{first_name|there}},</p>

<p>Quick update on your <strong>Maporia Pro All-in</strong> subscription.</p>

<p>We've restructured our plans: <strong>Pro All-in is now $19.99/month</strong> (down from $34.99) and <strong>$191.88/year</strong> (down from $335.88). We've already switched your subscription over — <strong>there's nothing for you to do</strong>.</p>

<p>Your next bill will reflect the new price. We didn't issue a credit for the current period; if that's something you'd like, just reply to this email and we'll sort it out.</p>

<p><strong>What stays the same:</strong></p>
<ul>
  <li>10 listings combined (locations + services + experiences)</li>
  <li>Premium access included</li>
  <li>Everything else you already get</li>
</ul>

<p><strong>Why we're doing this:</strong> we also launched Pro Creator ($14.99/mo) for service- or experience-only sellers. At $34.99 Pro All-in didn't make math sense next to the pieces — so we brought it down.</p>

<p>If you have any questions, just reply.</p>

<p>— Artem<br/>
Maporia<br/>
<a href="https://maporia.co">maporia.co</a></p>

# Placeholders

- `{{first_name|there}}` — first name, fallback to "there".
- (Optional, if Resend audience supports it): `{{period}}` → "monthly" / "yearly", `{{next_renewal}}` → ISO date.

# Notes

- **Sender domain:** `@maporia.co` (verified in Resend us-east-1). Не использовать `@maporia.com` — не верифицирован, отдаст `550`. См. memory `maporia_smtp.md`.
- **Send timing:** ОТПРАВЛЯТЬ только ПОСЛЕ успешного прогона `scripts/migrate-all-in-to-v3.mjs` в live (иначе письмо «уже переключили» врёт).
- **Idempotency:** скрипт `scripts/notify-all-in-repricing.mjs` дедупликует по `customer.id` через локальный JSON-лог `scripts/.notify-all-in-sent.json`. Повторный прогон тех же customer'ов — no-op.
