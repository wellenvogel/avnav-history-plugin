console.log("history main loaded");
(function(){
    let NAME="avnavHistoryPlugin";
    let HistoryChart;
    let COLORMAP=["#000000", "#FFFF00", "#1CE6FF", "#FF34FF",
        "#FF4A46", "#008941", "#006FA6", "#A30059",
        "#FFDBE5", "#7a4900", "#0000A6", "#63FFAC",
        "#B79762", "#004D43", "#8FB0FF", "#997D87",
        "#5A0007", "#809693", "#FEFFE6", "#1B4400",
        "#4FC601", "#3B5DFF", "#4A3B53", "#FF2F80",
        "#61615A", "#BA0900", "#6B7900", "#00C2A0",
        "#FFAA92", "#FF90C9", "#B903AA", "#D16100",
        "#DDEFFF", "#000035", "#7B4F4B", "#A1C299",
        "#300018", "#0AA6D8", "#013349", "#00846F",
        "#372101", "#FFB500", "#C2FFED", "#A079BF",
        "#CC0744", "#C0B9B2", "#C2FF99", "#001E09",
        "#00489C", "#6F0062", "#0CBD66", "#EEC3FF",
        "#456D75", "#B77B68", "#7A87A1", "#788D66",
        "#885578", "#FAD09F", "#FF8A9A", "#D157A0",
        "#BEC459", "#456648", "#0086ED", "#886F4C",
        "#34362D", "#B4A8BD", "#00A6AA", "#452C2C",
        "#636375", "#A3C8C9", "#FF913F", "#938A81",
        "#575329", "#00FECF", "#B05B6F", "#8CD0FF",
        "#3B9700", "#04F757", "#C8A1A1", "#1E6E00",
        "#7900D7", "#A77500", "#6367A9", "#A05837",
        "#6B002C", "#772600", "#D790FF", "#9B9700",
        "#549E79", "#FFF69F", "#201625", "#72418F",
        "#BC23FF", "#99ADC0", "#3A2465", "#922329",
        "#5B4534", "#FDE8DC", "#404E55", "#0089A3",
        "#CB7E98", "#A4E804", "#324E72", "#6A3A4C"];

    function readSettings(){
        let hours=document.querySelector('input[name="hour"]:checked').value;
        let dtype=document.querySelector('input[name="dtype"]:checked').value;
        let yMin = document.getElementById('yMin').value;
        let yMax = document.getElementById('yMax').value;
        let fieldCb=document.querySelectorAll('.fieldSelector input[type=checkbox]');
        let fields=[];
        for (let i = 0; i < fieldCb.length; i++) {
            let ce = fieldCb[i].parentElement.querySelector('input[type=color]');
            let fs = fieldCb[i].parentElement.querySelector('select');
            let formatter = 'default';
            if (fs) {
                formatter = fs.options[fs.selectedIndex].value;
            }
            fields.push(
                {
                    name: fieldCb[i].getAttribute('data-value'),
                    color: ce ? ce.value : '#000000',
                    formatter: formatter,
                    selected: !!fieldCb[i].checked
                }
            );
        }
        return {hours:hours,fields:fields,type:dtype,yMin:yMin,yMax:yMax};
    }
    let SETTINGSNAME='avnav-history-plugin';
    function storeSettings(){
        let settings=readSettings();
        window.localStorage.setItem(SETTINGSNAME,JSON.stringify(settings));
    }
    function setRadio(name,value){
        let he=document.querySelectorAll('input[name="'+name+'"]');
        let hasMatching=false;
        for (let i=0;i<he.length;i++){
            if (he[i].value === value){
                hasMatching=true;
                he[i].checked=true;
            }
            else{
                he[i].checked=false;
            }
        }
        if (! hasMatching){
            if (he.length > 0) he[0].checked=true;
        }
    }
    function fetchSettings(){
        let raw=window.localStorage.getItem(SETTINGSNAME);
        if (! raw) return false;
        try{
            let settings=JSON.parse(raw);
            setRadio('hours',settings.hours);
            setRadio('dtype',settings.type);
            document.getElementById('yMin').value=settings.yMin;
            document.getElementById('yMax').value=settings.yMax;
            hasMatching=false;
            let es=document.querySelectorAll('.fieldSelector');
            for (let i=0;i<es.length;i++){
                let cb=es[i].querySelector('input[type=checkbox]');
                if (! cb) continue;
                let value=cb.getAttribute('data-value');
                if (! value) continue;
                for (let s =0 ; s < settings.fields.length;s++) {
                    if (settings.fields[s].name === value){
                        let field=settings.fields[s];
                        cb.checked=field.selected || field.selected === undefined;
                        let cs=es[i].querySelector('input[type=color]');
                        if (cs) cs.value=field.color;
                        let fs=es[i].querySelector('select');
                        if (fs) fs.value=field.formatter||'default';
                        hasMatching=true;
                        break;
                    }
                }
            }
            return hasMatching;
        }catch (e){
            return false;
        }
    }

    function fillChart(){
        let settings=readSettings();
        storeSettings();
        let fields=[];
        settings.fields.forEach(function(f){
            if (f.selected || f.selected === undefined) fields.push(f);
        });
        let hours=settings.hours;
        let yMin=settings.yMin;
        let yMax=settings.yMax;
        if ((yMin != "") && (yMax != "")){
           if (parseInt(yMax) <= parseInt(yMin)) {
               yMin = "";
               yMax = ""
           }
        }
        if (fields.length < 1){
            HistoryChart.removeChart();
            return;
        }
        let now=new Date();
        let start=now.getTime()/1000 - hours*3600;
        let url="api/history?fromTime="+encodeURIComponent(start+"")+"&fields=";
        fields.forEach(function(field){url+=","+encodeURIComponent(field.name)});
        fetch(url)
        .then(function(resp){return resp.json()})
        .then(function(data){
            HistoryChart.removeChart();
            HistoryChart.createChart(data,fields,settings.type === 'line', yMin, yMax);
        })
        .catch(function(error){alert(error)});
    }

    function createCurrentField(value,className,removeCb){
        let fe=document.createElement('div');
        fe.classList.add(className)
        let cb=document.createElement('button');
        cb.classList.add('removeField')
        cb.setAttribute('data-value',value);
        cb.addEventListener('click',removeCb)
        cb.textContent="-";
        fe.appendChild(cb);
        let lb=document.createElement('span');
        lb.classList.add('label');
        lb.textContent=value;
        fe.appendChild(lb);
        return fe;
    }
    function createFieldSelector(value,color,className){
        let fe=document.createElement('div');
        fe.classList.add(className)
        let cb=document.createElement('input');
        cb.setAttribute('type','color');
        cb.setAttribute('value',color);
        cb.addEventListener('change',storeSettings)
        cb.classList.add('colorSelect');
        fe.appendChild(cb);
        cb=document.createElement('select');
        cb.classList.add("formatterSelect");
        cb.value='default';
        cb.addEventListener('change',storeSettings)
        for (let fn in window[NAME].HistoryFormatter){
            let o=document.createElement('option');
            o.setAttribute('value',fn);
            o.textContent=fn;
            //if (fn === 'default') o.setAttribute('selected','selected');
            cb.appendChild(o);
        }
        fe.appendChild(cb);
        cb=document.createElement('input');
        cb.setAttribute('type','checkbox');
        cb.setAttribute('data-value',value);
        cb.addEventListener('change',storeSettings)
        fe.appendChild(cb);
        let lb=document.createElement('span');
        lb.classList.add('label');
        let ct='';
        value.split('.').forEach(function(part){
            if (ct !== '') ct+='.<wbr>';
            ct+=part;
        })
        lb.innerHTML=ct;
        fe.appendChild(lb);
        return fe;
    }
    function createRadio(name,label,value,className){
        let i=document.createElement('input');
        i.setAttribute('type','radio');
        i.value=value;
        i.setAttribute('name',name);
        let l=document.createElement('label');
        l.textContent=label;
        l.appendChild(i);
        return l;
    }
    let closeOverlayFromButton=function(btEvent){
        let target=btEvent.target;
        while (target && target.parentElement){
            target=target.parentElement;
            if (target.classList.contains('overlayFrame')){
                showHideOverlay(target,false);
                return;
            }
        }
    }
    let showHideOverlay=function(id,show){
        let ovl=id;
        if (typeof(id) === 'string'){
            ovl=document.getElementById(id);
        }
        if (!ovl) return;
        ovl.style.visibility=show?'unset':'hidden';
        return ovl;
    }
    let currentEditableFields=[];
    let saveSettings=function(ev){
        //TODO: checks
        let storeKeys=[];
        let sensorNames=[];
        currentEditableFields.forEach(function(field){
            if (field.match(/^gps\./)){
                storeKeys.push(field);
            }
            else{
                sensorNames.push(field);
            }
        });
        let nv={
            storeKeys:storeKeys.join(','),
            sensorNames:sensorNames.join(',')
        }
        settingsParam.forEach(function(p){
            let el=document.getElementById('settings_'+p);
            if (el) nv[p]=el.value;
        })
        let url='api/saveSettings?';
        for (let k in nv){
            url+=k+"="+encodeURIComponent(nv[k])+"&";
        }
        fetch(url)
        .then(function(r){return r.json()})
        .then(function(data){
            if (data.status !== 'OK') {
                alert(data.status);
                return;
            }
            showHideOverlay('editOverlay',false);
            window.setTimeout(function(){
                window.location.href=window.location.href;
            },2000);
        })
        .catch(function(e){alert(e)});
    }
    let showHideNewField=function(name,show){
        let fieldList=document.getElementById('newFieldList');
        for (let i=0;i<fieldList.children.length;i++){
            if (fieldList.children[i].value === name){
                fieldList.children[i].style.display=show?'unset':'none';
            }
        }
        if (!show) fieldList.selectedIndex=-1;
    }
    let removeField=function(ev){
        let current=ev.target;
        let name=current.getAttribute('data-value');
        while (current && ! current.classList.contains('existingField')){
            current=current.parentElement;
        }
        if (current && current.classList.contains('existingField')){
            current.parentElement.removeChild(current);
        }
        let idx=currentEditableFields.indexOf(name);
        if (idx >= 0) currentEditableFields.splice(idx,1);
        showHideNewField(name,true);
    }
    let settingsParam=['period','storeTime'];
    let showSettings=function(){
        showHideOverlay('editOverlay',true);
        fetch('api/status')
            .then(function(resp){return resp.json()})
            .then(function(data){
                let frame=document.getElementById('editCurrentFields');
                if (! frame) return;
                frame.textContent='';
                currentEditableFields=data.fields;
                data.fields.forEach(function(field){
                    let el=createCurrentField(field,'existingField',removeField);
                    frame.appendChild(el);

                })
                settingsParam.forEach(function(p){
                    let el=document.getElementById("settings_"+p);
                    if (el) el.value=data[p];
                });
                fetch('api/listKeys')
                    .then(function(resp){return resp.json()})
                    .then(function(data){
                        let target=document.getElementById('newFieldList');
                        target.textContent='';
                        data.data.forEach(function(key){
                            let o=document.createElement('option');
                            o.value=key;
                            o.textContent=key;
                            if (currentEditableFields.indexOf(key)>=0){
                                o.style.display='none';
                            }
                            target.appendChild(o);
                        })
                    });
            })
            .catch(function(e){alert(e)})
    }
    let addField=function(){
        let selector=document.getElementById('newFieldList');
        if (selector.selectedIndex < 0) return;
        let field=selector.options[selector.selectedIndex].value;
        let frame=document.getElementById('editCurrentFields');
        if (currentEditableFields.indexOf(field)>=0) return;
        frame.appendChild(createCurrentField(field,'existingField',removeField));
        currentEditableFields.push(field);
        showHideNewField(field,false);
    }
    let buttonActions={
        closeEditOverlay: closeOverlayFromButton,
        saveEditOverlay: saveSettings,
        start: fillChart,
        reload: function(){window.location.href=window.location.href},
        settings: showSettings,
        addField: addField

    }

    window.addEventListener('load',function(){
        if (! window[NAME] || ! window[NAME].HistoryChart){
            let el=document.getElementById('#chart');
            el.textContent("Module not correctly loaded");
            return;
        }
        let buttons=document.querySelectorAll('button')
        for (let i=0;i<buttons.length;i++){
            let bt=buttons[i];
            let handler=buttonActions[bt.getAttribute('id')]||
                buttonActions[bt.getAttribute('name')];
            if (handler){
                bt.addEventListener('click',handler);
            }    

        }
        HistoryChart=new window[NAME].HistoryChart('#chart');
        this.fetch('api/status')
            .then(function(resp){return resp.json()})
            .then(function(data){
                let hours=data.storeTime;
                let numHours=5;
                let selectHours=[];
                for (let i=numHours;i>=1;i--){
                    selectHours.push(Math.ceil(i*hours/numHours));
                }
                let hsParent=document.getElementById('hourSelect');
                for (let i=0;i<selectHours.length;i++){
                    let hs=createRadio('hour',selectHours[i]+"h",selectHours[i],"hourSelector");
                    hsParent.appendChild(hs);
                }
                let typeParent=document.getElementById('typeSelect');
                let types=['dot','line'];
                for (let i=0;i<types.length;i++){
                    let hs=createRadio('dtype',types[i],types[i],"typeSelector");
                    typeParent.appendChild(hs);
                }
                document.querySelector('input[name="hour"]:first-of-type').checked=true;
                document.querySelector('input[name="dtype"]:first-of-type').checked=true;
                let colorIndex=4;
                if (data.fields){
                    let selectorList=document.getElementById('selectors');
                    for (let i=0;i<data.fields.length;i++){
                        let fs=createFieldSelector(data.fields[i],COLORMAP[colorIndex],"fieldSelector")
                        colorIndex+=1;
                        if (colorIndex >= COLORMAP.length) colorIndex=0;
                        selectorList.appendChild(fs);
                    }
                }
                if (! data.canEdit){
                    let bt=document.getElementById('settings');
                    if (bt) bt.style.display='none';
                }
                if (fetchSettings()){
                    fillChart();
                }
            })
            .catch(function(error){alert(error);})  
        window.addEventListener('resize',function(){
            window.setTimeout(fillChart,100);
        })
    });
})();


