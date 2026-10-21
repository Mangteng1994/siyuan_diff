import { Plugin, openTab, getActiveEditor, showMessage } from 'siyuan';
import { DiffPanel } from './panel';
import './index.css';
const TAB='document-diff';
export default class DocumentDiffPlugin extends Plugin {
  private panels=new Map<Element,DiffPanel>();
  private lastDocument?:string;
  private rememberDocument=()=>{
    const id=getActiveEditor()?.protyle?.block?.rootID;
    if(id)this.lastDocument=id;
  };
  onload() {
    this.addIcons('<symbol id="iconDocumentDiff" viewBox="0 0 32 32"><path d="M4 3h10v3H7v20h7v3H4V3zm14 0h10v26H18v-3h7V6h-7V3zM9 11h6v3H9v-3zm8 7h6v3h-6v-3zm2-3h3v9h-3v-9z"/></symbol>');
    const plugin=this;
    this.addTab({type:TAB,init(){
      const panel=new DiffPanel(this.element as HTMLElement,undefined,()=>{plugin.rememberDocument();return plugin.lastDocument;});
      plugin.panels.set(this.element,panel);
    },destroy(){plugin.panels.get(this.element)?.destroy();plugin.panels.delete(this.element);}});
    this.addTopBar({icon:'iconDocumentDiff',title:'文档Diff',position:'right',callback:()=>this.open()});
    this.addCommand({langKey:'openDiff',hotkey:'⇧⌥D',callback:()=>this.open()});
    this.eventBus.on('switch-protyle',this.rememberDocument);
    this.eventBus.on('loaded-protyle-static',this.rememberDocument);
  }
  private open() {
    this.rememberDocument();
    void openTab({app:this.app,custom:{id:this.name+TAB,icon:'iconDocumentDiff',title:'文档Diff'},keepCursor:false}).catch(error=>showMessage(`无法打开文档Diff：${String(error)}`));
  }
  onunload() {
    this.eventBus.off('switch-protyle',this.rememberDocument);
    this.eventBus.off('loaded-protyle-static',this.rememberDocument);
    this.panels.forEach(panel=>panel.destroy());this.panels.clear();
  }
}
