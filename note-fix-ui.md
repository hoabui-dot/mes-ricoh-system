## This is UI issue that i see, please check and update
### MES console UI
- in `master-data/equipment` rouer, "Thiết Bị & Máy Móc (Equipment)" and "Danh mục máy ép lưu hóa, máy cắt, máy trộn cao su" as a title and subtitle in language selector UI don't change the translation after i change to the other langauge on client
- in `master-data/items` router, i see the seed data dont have item name and code in table, but i think it requirem field right, check seed script here then check rule of database then fix issue
- in Create form here, you dont see you change to use select base of shacdn, you still keep basic html select, please change to use all of ui of shacdn if we you here, or if you use the other ways, please update UI for fully, check the same select option case
- when we change to the other router or the other page, the page detail information will change, but i need more detail of about the current page or the current form without summary like this, example when i in Create work order page, this must tell me the detail of data, the relationship and validation of this command with MES, employees ? i mean if i want to create a work order, the system will check WMS, then export item, assign which employee, which work center and many more rule before. Because im in a demo to director, i need a non-tech can see all of feature flow in detail page modal and i can really easy to explain about my page, this need apply for all console system UI as MES, WMS, QMS,...
- in `master-data/routings` router, the status value in table must whitespace nowrap because i see it breakwork become 2 line
- in `master-data/production-versions` router, the  pv code and item code is empty same as the previous case that i report, remember, you need report me the reason that why this empty when we implement system carefully before, sometim this is foreign key of the other page then we note or skip it to implement later properply
- add light mode / dark mode feature, this apply to free system and unified portal also
- because we apply mutil language system, so for all CRUD form, we need check again to make sure we can create/edit maping with current database design. this must check for all system
- in `master-data/production-standards` router, the title and subtitle still dont apply translation or missed, check and fix, the Name / Description in table is also
- in `master-data/skills` router the title and subtitle still dont apply translation or missed, check and fix
### Portal
- we need change UI of portal to current layout, theme, color of MES, WMS and QMS, remove some icon that make this UI same as vide coding AI, use shacdn UI, for all case, tailwindcss, you need add lint and type check
- check i18n translation here, then update for all text on client side
- check the layout then make it become a premium layout if you can

