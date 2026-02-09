class Player {
  static defaultState = PrivatePlayerSchema.default;

  constructor(id, name) {
    this.name = name;
    this.state = JSON.parse(JSON.stringify(Player.defaultState));
    this.state.id=id;
  }

  toJSObject() {
    return this.state;
  }

  explore() {
    // console.log(`Player explored, stamina replenished`);
    this.state.stamina += 50;

    let y = this.state.position.y;

    y++;
    if(y >= 254) {
      y=0
    }

    this.state.position.y = y;
  }

  escape() {
    console.log(`Player escaped, health recovered`);
    this.state.health += 25;
  }

  attack() {
    if(this.state.stamina <= 0) {
      console.log(`Player cant fight, he is too tired`);
      return;
    }

    if(this.state.health <= 0) {
      console.log(`Player cant fight, he is too injured`);
      return;
    }

    const expGain = 100;
    console.log(`Player Attacks gain exp ${expGain}`);
    this.state.exp += expGain;
    this.state.stamina -= 10;
    this.state.health -= 5;

    if(this.state.exp >= 500*this.state.level*0.5) {
      this.state.level++;
      this.state.exp = 0;
      this.state.stamina = 100;
      this.state.health = 100;
    }
  }
}


// Check which environment we are in and attach functions to the appropriate global scope
if (typeof window !== 'undefined') {
  // We are in a browser
  window.Player = Player;
} else if (typeof global !== 'undefined') {
  // We are in Node.js (CommonJS environment check)
  global.Player = Player;
}