## deepseek-chat — 20 documents, 140 fields

| Prompt | Pipeline | Coverage | Wrong answers | Filled a field the document doesn't state |
|---|---|---|---|---|
| strict | model output | 95.5% | 0 / 105 (0.0%) | 0 / 30 |
| strict | + verification | 95.5% | 0 / 105 (0.0%) | 0 / 30 |
| guess | model output | 99.1% | 25 / 134 (18.7%) | 24 / 30 |
| guess | + verification | 99.1% | 4 / 113 (3.5%) | 4 / 30 |

Coverage = correct answers / fields the document states.
- strict: verification dropped 0 correct answer(s)
- guess: verification dropped 0 correct answer(s)
  - rfq-03.target_price: "best price (no figure given)" passed verification but is wrong
  - rfq-08.delivery_date: "尽快（未指定具体日期）" passed verification but is wrong
  - ship-02.container_no: "to be confirmed after loading" passed verification but is wrong
  - ship-03.bl_number: "BKG-55120" passed verification but is wrong
