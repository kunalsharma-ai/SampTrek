# Audience question sets for the gate survey

The question builder (Gate & security → Gate survey questions, and the same section on Create project)
has an **Audience sets** button. It opens ready-made demographic question sets:

| Key | Set | What it asks |
| --- | --- | --- |
| `b2b` | B2B (business decision makers) | Employment (not working screens out), job level, department, company size, industry, role in buying decisions (not involved screens out) |
| `b2c` | B2C (general consumers) | Age 18+, gender, postal code, household size, income (in the project currency), employment, education |
| `decision_makers` | Decision makers | Employment, seniority (staff screens out), function, purchase areas they approve ("None" screens out), budget, company size |
| `tobacco` | Tobacco and nicotine users | Age 18+ (set to the legal age per country), gender, products used in the past 30 days ("None" screens out), frequency, amount, brand, plans to quit |
| `parents` | Parents | Age 18+, gender, parent/guardian of a child under 18 (no screens out), number of children (at least 1), children's ages, who decides purchases, income |
| `teens` | Teens (13 to 17) | Parent/guardian permission (no screens out), age 13–17, gender, school year, devices used weekly, city |
| `hc_consumer` | Healthcare: consumers | Age 18+, gender, health cover, self-rated health, diagnosed conditions, doctor visits, over-the-counter purchases |
| `hc_patient` | Healthcare: patients | Age 18+, gender, diagnosed conditions ("None" screens out), when diagnosed, current treatment, who treats them, health cover |
| `hc_caregiver` | Healthcare: caregivers | Age 18+, gender, unpaid caregiver (paid or no screens out), who they care for, the condition, hours a week, how long, live together |
| `hcp` | Healthcare professionals (HCP) | Profession (not in healthcare screens out), specialty, years in practice (2 to 35), work setting, patients a month, share of time with patients (under 50% screens out) |

The questions are in `apps/api/src/survey/question-sets.ts` and use the same question model as the
builder, so each one can be opened and changed (words, answers, which answers qualify or screen out,
validation), deleted, moved or duplicated on the project, and new questions can be added.

**Add to project** adds the set's questions that are not on the list yet (same question id = same
question, so adding B2C after Parents does not ask age twice). A project has at most 30 gate questions.

## Survey library (Admin → Survey)

The **Survey** page in the Admin menu (`/settings/surveys`) lists every set. Editors pick one, add
questions (**Add question** for your own, **Library** for single demographic questions, **Audience sets**
to copy from another set), edit them, and **Save**. **New set** makes one of the organisation's own.

Each set also lists the **project categories** it is for. On Create project, choosing a category fills
the gate survey with that category's set (when nobody has picked questions yet) and turns the gate
survey on; the project can still change the questions. When two sets list the same category, the one
further down the list (your own sets come last) wins. Built-in defaults: B2B → `b2b`; B2C, Consumer and
B2C-B2B → `b2c`; Teens-And-Parents → `parents`; Healthcare-Consumer → `hc_consumer`;
Healthcare-Professional → `hcp`.

## Changing a set for the whole organisation

Editors (admins and project managers) can, from the dialog:

- **Save this project's questions as this set**: the organisation's version of a built-in set. It is
  marked *Edited* and offered to everyone in the organisation from then on.
- **Reset to standard**: deletes the organisation's version, so the built-in set is back.
- **Save this project's questions as a new set**: a set of the organisation's own (up to 50), which can
  be overwritten or deleted later.

Saving or deleting a set never changes projects that already use its questions. Stored in
`QuestionSet (organizationId, key, name, description, questions, categories)`. `categories` left out
of a save keeps what the set had; null on a built-in set means its default categories.

API (feature `projects`): `GET /question-templates/sets?currency=USD`,
`PUT /question-templates/sets/:key` (`key` = a built-in key, a `custom-…` key, or `new`),
`DELETE /question-templates/sets/:key`.
