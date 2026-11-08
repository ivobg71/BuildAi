const ISS={
 damp:{l:"Влага / плесен",ph:1,c:[600,2500],t:["Намерете източника на влагата (течове, водосточни тръби, кондензация)","Отстранете източника, след което обработете стените с грунд срещу плесен","Подобрете вентилацията (аспиратори, вентилационни отвори)","Измажете отново и боядисайте с дишаща боя"],q:"как да премахна влага и плесен от стени",r:["Влагомер","Грунд срещу плесен","Дишаща варова боя","Аспиратор"]},
 cracks:{l:"Пукнатини по стените",ph:1,c:[300,3000],t:["Наблюдавайте пукнатините 4–8 седмици (с маяк), за да видите дали се движат","Консултирайте се с конструктор при пукнатини над 5 мм","Разширете, запълнете с гъвкав фугопълнител или епоксид и залепете мрежа","Шпакловайте и боядисайте"],q:"как да ремонтирам пукнатини по стени конструктивни или козметични",r:["Маяк за пукнатини","Гъвкав фугопълнител","Лента с мрежа","Комплект за епоксидно инжектиране"]},
 roof:{l:"Покрив / течове",ph:0,c:[1500,9000],t:["Огледайте керемидите, обшивките и водосточните тръби","Сменете счупените керемиди / поправете обшивките","Положете наново подпокривна мембрана и добавете изолация при нужда","Почистете и закрепете отново улуците и водосточните тръби"],q:"как да ремонтирам покрив керемиди и течове",r:["Керемиди","Обшивъчна лента","Дишаща мембрана","Комплект улуци"]},
 electric:{l:"Стара електроинсталация",ph:2,c:[1500,6000],t:["Поканете лицензиран електротехник да прегледа таблото и кабелите","Сменете старите кабели и таблото и добавете дефектнотокова защита","Планирайте контактите и осветлението преди мазилката","Тествайте и сертифицирайте инсталацията"],q:"подмяна на електроинсталация в къща обяснение",r:["Табло с дефектнотокова защита","Кабели и тръби","Комплект контакти и ключове","LED осветление"]},
 plumb:{l:"ВиК инсталация",ph:2,c:[1200,5000],t:["Проверете тръбите за течове, корозия и ниско налягане","Сменете старите метални тръби с PEX/многослойни","Направете проба на налягане, преди да затворите стените","Монтирайте нови санитарни изделия и хидроизолирайте мокрите помещения"],q:"смяна на водопроводни тръби PEX",r:["PEX тръби и фитинги","Колектор","Спирателни кранове","Хидроизолационна мембрана"]},
 floor:{l:"Подове",ph:3,c:[800,4500],t:["Премахнете повредената настилка и проверете основата","Изравнете със саморазливна замазка","Положете подложка и новата настилка","Монтирайте первази и завършете краищата"],q:"как да положа ламинат или плочки на пода",r:["Саморазливна замазка","Подложка","Настилка (плочки/ламинат/паркет)","Первази"]},
 windows:{l:"Прозорци / врати",ph:3,c:[1200,6000],t:["Измерете отворите точно","Поръчайте дограма с двоен/троен стъклопакет","Демонтирайте старите рамки и монтирайте новите с пяна и ленти","Уплътнете, обшийте и регулирайте обкова"],q:"как да монтирам нова дограма",r:["PVC/алуминиева дограма","Монтажна пяна","Силикон","Монтажна лента за прозорци"]},
 insul:{l:"Изолация / студ",ph:2,c:[1500,7000],t:["Проверете за студени петна с термокамера или с ръка","Изолирайте първо покрива/тавана, след това стените","Добавете пароизолация, където е нужно","Уплътнете течението около отворите"],q:"как да изолирам стени и таван",r:["Минерална вата / EPS","Пароизолация","Изолационни плоскости","Уплътнители"]},
 paint:{l:"Лющеща се боя / мазилка",ph:4,c:[400,2500],t:["Остържете разхлабената боя и шлифовайте","Поправете мазилката и нанесете грунд","Два пласта качествена боя","Залепете тиксо и завършете първазите"],q:"как да измажа и боядисам стена като професионалист",r:["Мазилка/шпакловка","Грунд","Боя (2 пласта)","Валяк и тиксо"]},
 kitchen:{l:"Кухня / баня",ph:4,c:[3000,14000],t:["Проектирайте разположението и поръчайте шкафовете рано","Направете първа фаза ВиК и електро","Поставете плочки, шкафове и плот","Финални свързвания и уплътняване"],q:"ремонт на кухня стъпка по стъпка",r:["Шкафове и плот","Плочки и лепило","Санитарен фаянс","Силикон"]}
};
const PH=["Етап 1 · Оглед и конструкция","Етап 2 · Влага и обвивка на сградата","Етап 3 · Инсталации (първа фаза)","Етап 4 · Подове, дограма и затваряне","Етап 5 · Довършителни работи"];
const PHT=["1–2 седмици","1–3 седмици","2–4 седмици","2–3 седмици","2–4 седмици"];
const AREAS=["Фасада / екстериор","Покрив","Дневна","Кухня","Баня","Спалня","Мазе / таван","Друго"];
let photos=[],sel=new Set(),res=null,tab="plan",extra=new Set();
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const yt=q=>"https://www.youtube.com/results?search_query="+encodeURIComponent(q);
const money=n=>"€"+(Math.round(n/50)*50).toLocaleString("en-US");

$("issues").innerHTML=Object.entries(ISS).map(([k,v])=>`<span class="chip" data-k="${k}">${v.l}</span>`).join("");
$("issues").onclick=e=>{const k=e.target.dataset.k;if(!k)return;sel.has(k)?sel.delete(k):sel.add(k);e.target.classList.toggle("on")};

const drop=$("drop"),file=$("file");
drop.onclick=()=>file.click();
["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("on")}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("on")}));
drop.addEventListener("drop",e=>add(e.dataTransfer.files));
file.onchange=()=>{add(file.files);file.value=""};
function add(fl){[...fl].filter(f=>f.type.startsWith("image/")).forEach(f=>{photos.push({url:URL.createObjectURL(f),area:AREAS[0],name:f.name})});drawThumbs()}
function drawThumbs(){
 $("thumbs").innerHTML=photos.map((p,i)=>`<div class="th"><img src="${p.url}" alt=""><button data-d="${i}" aria-label="Премахни">×</button><select data-i="${i}">${AREAS.map(a=>`<option${a===p.area?" selected":""}>${a}</option>`).join("")}</select></div>`).join("");
}
$("thumbs").onclick=e=>{if(e.target.dataset.d!==undefined){photos.splice(+e.target.dataset.d,1);drawThumbs();if(res)render()}};
$("thumbs").onchange=e=>{photos[+e.target.dataset.i].area=e.target.value;if(res)render()};

$("go").onclick=()=>{
 const area=Math.max(10,+$("area").value||80),scope=+$("scope").value,type=$("type").value;
 const keys=new Set([...sel,...extra]);
 if(photos.some(p=>p.area==="Покрив"))keys.add("roof");
 if(photos.some(p=>p.area==="Кухня"||p.area==="Баня"))keys.add("kitchen");
 if(photos.some(p=>p.area==="Мазе / таван"))keys.add("damp");
 if(scope===2){["electric","plumb","insul","floor","paint"].forEach(k=>keys.add(k))}
 if(!keys.size)keys.add("paint");
 const f=area/80,sm=[0.6,1,1.5][scope];
 const items=[...keys].map(k=>({k,...ISS[k],lo:ISS[k].c[0]*f*sm,hi:ISS[k].c[1]*f*sm}));
 const lo=items.reduce((a,i)=>a+i.lo,0),hi=items.reduce((a,i)=>a+i.hi,0);
 res={area,scope,type,items,lo,hi};
 tab="plan";render();
 if(innerWidth<820)$("tabs").scrollIntoView({behavior:"smooth"});
};

function render(){
 if(!res)return;
 const T=[["plan","План"],["budget","Бюджет"],["res","Ресурси"],["vid","Уроци"],["ph","Снимки"]];
 $("tabs").innerHTML=T.map(([k,l])=>`<button class="tab${k===tab?" on":""}" data-t="${k}">${l}</button>`).join("");
 const {items,lo,hi,area,type}=res;let h="";
 if(tab==="plan"){
  h=`<h2>План за ремонт · ${esc(type)}, ${area} м²</h2><p style="color:var(--mu)">Работете в този ред, за да не се налага да преправяте вече завършена работа.</p>`;
  for(let p=0;p<5;p++){const g=items.filter(i=>i.ph===p);if(!g.length)continue;
   h+=`<div class="phase"><h3>${PH[p]}</h3><small>≈ ${PHT[p]}</small>${g.map(i=>`<div style="margin-top:8px"><span class="tag">${i.l}</span><ul>${i.t.map(x=>`<li>${x}</li>`).join("")}</ul></div>`).join("")}</div>`;}
  h+=`<div class="note">⚠ За конструктивни, електро и газови работи винаги наемайте лицензиран специалист. Проверете местните изисквания за разрешителни преди да започнете.</div>`;
 }
 if(tab==="budget"){
  h=`<h2>Приблизителен бюджет</h2><div class="big">${money(lo)} – ${money(hi)}</div><div class="note">Включва материали и труд. Добавете 10–20% резерв: <b>${money(hi*1.15)}</b> в най-лошия случай.</div><div style="margin-top:14px">`+
  items.map(i=>`<div class="row"><span>${i.l}</span><b>${money(i.lo)} – ${money(i.hi)}</b></div>`).join("")+`</div><div class="note">Груби оценки според площта и обхвата; поискайте 3 местни оферти.</div>`;
 }
 if(tab==="res"){
  h=`<h2>Материали и ресурси</h2><div class="grid">`+items.map(i=>`<div class="card" style="margin:0"><b>${i.l}</b><ul style="padding-left:18px;margin:6px 0">${i.r.map(x=>`<li>${x} <a href="https://www.google.com/search?q=${encodeURIComponent(x+" купи")}" target="_blank" rel="noopener">търси ↗</a></li>`).join("")}</ul></div>`).join("")+`</div>
  <h2 style="margin-top:18px">Полезни ръководства</h2><ul>
  <li><a target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent("разрешително за ремонт изисквания "+type)}">Изисквания за разрешителни ↗</a></li>
  <li><a target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent("ремонт чеклист ред на строителните работи")}">Чеклист: ред на работите ↗</a></li>
  <li><a target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent("лицензиран строителен изпълнител близо до мен")}">Намерете лицензирани изпълнители ↗</a></li></ul>`;
 }
 if(tab==="vid"){
  h=`<h2>Уроци в YouTube</h2><p style="color:var(--mu)">Отваря търсене в YouTube за всяка задача от вашия план.</p><div class="grid">`+
  items.map(i=>`<a class="vid" target="_blank" rel="noopener" href="${yt(i.q)}"><div class="pl">▶</div><div><b>${i.l}</b>${i.q}</div></a>`).join("")+
  `<a class="vid" target="_blank" rel="noopener" href="${yt("планиране на бюджет за ремонт грешки, които да избегнете")}"><div class="pl">▶</div><div><b>Планиране</b>планиране на бюджет за ремонт грешки, които да избегнете</div></a></div>`;
 }
 if(tab==="ph"){
  h=`<h2>Вашите снимки</h2>`+(photos.length?`<div class="grid">`+photos.map(p=>{
    const rel=items.filter(i=>(p.area==="Покрив"&&i.k==="roof")||((p.area==="Кухня"||p.area==="Баня")&&i.k==="kitchen")||(p.area==="Мазе / таван"&&i.k==="damp")||(p.area==="Фасада / екстериор"&&["cracks","paint","windows"].includes(i.k))||(["Дневна","Спалня"].includes(p.area)&&["floor","paint","windows","electric"].includes(i.k)));
    return `<div class="card" style="margin:0;padding:8px"><img src="${p.url}" alt="" style="width:100%;border-radius:8px;height:150px;object-fit:cover"><b>${p.area}</b><div style="margin-top:4px">${rel.map(i=>`<span class="tag">${i.l}</span>`).join("")||'<span class="note">Няма свързани задачи</span>'}</div></div>`}).join("")+`</div>`:`<div class="empty">Все още няма качени снимки.</div>`);
 }
 $("out").innerHTML=h;
}
$("tabs").onclick=e=>{if(e.target.dataset.t){tab=e.target.dataset.t;render()}};

// Прост асистент, базиран на правила (заменете reply() с реално извикване на AI API от вашия сървър)
const KW={damp:["damp","mould","mold","humid","condens","влаг","плесен","конденз"],cracks:["crack","пукнат"],roof:["roof","leak","tile","gutter","покрив","теч","керемид","улук"],electric:["wire","wiring","electr","socket","електр","кабел","контакт","ток"],plumb:["pipe","plumb","тръб","водопров","вик","налягане"],floor:["floor","parquet","laminate","подове","подов","паркет","ламинат"],windows:["window","door","glaz","прозор","врат","дограма","стъклопакет"],insul:["insul","cold","heat","draught","изолац","студ","топл","течение"],paint:["paint","plaster","peel","wall","боя","боядис","мазилк","лющ","стен"],kitchen:["kitchen","bath","кухн","баня","бани"]};
function reply(q){
 const s=q.toLowerCase(),hit=Object.keys(KW).filter(k=>KW[k].some(w=>s.includes(w)));
 if(/budget|cost|price|how much|бюджет|цена|цени|струва|колко|разход/.test(s))return res?`Текущата ви оценка е ${money(res.lo)} – ${money(res.hi)}. Оставете 15% резерв.`:"Първо генерирайте план и ще изчисля цената според снимките и площта ви.";
 if(!hit.length)return "Мога да помогна с влага, пукнатини, покриви, електроинсталация, ВиК, подове, прозорци, изолация, боядисване и кухни/бани. С кой от тях се сблъсквате?";
 hit.forEach(k=>{extra.add(k);sel.add(k)});
 document.querySelectorAll("#issues .chip").forEach(c=>c.classList.toggle("on",sel.has(c.dataset.k)));
 const i=ISS[hit[0]];
 return `${i.l}: ${i.t[0].toLowerCase()}; след това: ${i.t[1].toLowerCase()}. Добавих го към данните за плана – натиснете „Генерирай“ за обновяване или <a href="${yt(i.q)}" target="_blank" rel="noopener">гледайте уроци ↗</a>.`;
}
function send(){const q=$("q").value.trim();if(!q)return;$("q").value="";
 const c=$("chat");c.insertAdjacentHTML("beforeend",`<div class="m u">${esc(q)}</div>`);
 c.insertAdjacentHTML("beforeend",`<div class="m a">${reply(q)}</div>`);c.scrollTop=c.scrollHeight}
$("send").onclick=send;$("q").onkeydown=e=>{if(e.key==="Enter")send()};