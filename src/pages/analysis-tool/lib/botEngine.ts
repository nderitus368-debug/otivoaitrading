import Interpreter from '../../../external/bot-skeleton/services/tradeEngine/utils/interpreter';
import { api_base } from '../../../external/bot-skeleton/services/api/api-base';

class BotEngine {
  public isRunning = false;
  public tradeParams = {
    options: {
      amount: 1
    }
  };
  private interpreter: any = null;

  async start(token: string, code: string, id: string, name: string) {
    console.log(`Starting Real Bot: ${name} (${id})`);
    
    try {
      if (!api_base.api) {
        await api_base.init();
      }

      // Real authorization
      const response = await api_base.api.authorize(token);
      if (response.error) {
        console.error("Auth Error:", response.error);
        return;
      }

      if (this.interpreter) {
        await this.interpreter.stop();
      }

      this.interpreter = Interpreter();
      this.isRunning = true;

      this.interpreter.run(code).catch((err: any) => {
        console.error(`[${name}] Runtime Error:`, err);
        this.isRunning = false;
      });
    } catch (error) {
      console.error(`Failed to start bot ${name}:`, error);
      this.isRunning = false;
    }
  }

  async stop() {
    console.log('Stopping Bot');
    if (this.interpreter) {
      await this.interpreter.stop();
      this.interpreter = null;
    }
    this.isRunning = false;
  }

  getBotInterface() {
    if (this.interpreter) {
      return this.interpreter.bot.getInterface();
    }
    
    // Fallback interface for notifications before/after run
    return {
      notify: (type: 'success' | 'info' | 'warn' | 'error', message: string) => {
        console.log(`[BOT NOTIFY - ${type}]: ${message}`);
        window.dispatchEvent(new CustomEvent('bot_notify', { detail: { type, message } }));
      },
      switchMarket: (symbol: string) => {
        console.log(`[BOT] Switching market to: ${symbol}`);
      },
      checkResult: (type: string) => false,
      readDetail: (detail: string) => 0,
      sleep: (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000)),
      tradeAgain: () => {},
      emergencyReset: () => {
        if (this.interpreter) this.interpreter.bot.tradeEngine.observer.emit('REVERT', 'before');
      }
    };
  }
}

export const botEngine = new BotEngine();
